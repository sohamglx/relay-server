import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { and, eq, gt, or } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { v4 } from "uuid";
import { db } from "../db/index.js";
import { authSessionsTable, usersTable } from "../db/schema.js";
import { createUserDto, loginDto, refreshTokenDto } from "../dto/auth.dto.js";
import { CredentialsService } from "./credentials.service.js";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  REFRESH_TOKEN_TTL_SECONDS,
  TokenService,
} from "./token.service.js";

@Injectable()
export class AuthService {
  constructor(
    private readonly credentialsService: CredentialsService,
    private readonly tokenService: TokenService,
  ) { }

  async login(body: loginDto) {
    const identifier = (body.email || body.username)!;
    const [user] = await db
      .select()
      .from(usersTable)
      .where(
        or(
          eq(usersTable.username, identifier),
          eq(usersTable.email, identifier),
        ),
      )
      .limit(1)
      .execute();

    if (
      !user ||
      !(await this.credentialsService.checkPassword(
        body.password,
        user.password,
      ))
    ) {
      throw new UnauthorizedException("Invalid username/email or password");
    }

    return this.createSession(user);
  }

  async register(body: createUserDto) {
    const [existingUser] = await db
      .select({ uid: usersTable.uid })
      .from(usersTable)
      .where(
        or(
          eq(usersTable.username, body.username),
          eq(usersTable.email, body.email),
        ),
      )
      .limit(1)
      .execute();

    if (existingUser) {
      throw new ConflictException("Username or email is already registered");
    }

    const user: typeof usersTable.$inferInsert = {
      uid: v4(),
      username: body.username,
      email: body.email,
      password: await this.credentialsService.hashPassword(body.password),
      name: "",
    };

    const [createdUser] = await db
      .insert(usersTable)
      .values(user)
      .returning()
      .execute();

    return this.createSession(createdUser);
  }

  async refresh(refreshToken: refreshTokenDto["refreshToken"]) {
    if (!refreshToken) {
      throw new UnauthorizedException({
        statusCode: 401,
        error: "Unauthorized",
        message: "Invalid or expired refresh token",
        details: [
          {
            field: "refreshToken",
            message:
              "refreshToken is required in the request body or Authorization Bearer header",
          },
        ],
      });
    }

    const claims = await this.tokenService.verifyRefreshToken(refreshToken);
    const now = new Date();
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.uid, claims.sub))
      .limit(1)
      .execute();
    const [session] = await db
      .select()
      .from(authSessionsTable)
      .where(
        and(
          eq(authSessionsTable.id, claims.jti),
          eq(authSessionsTable.userUid, claims.sub),
          gt(authSessionsTable.expiresAt, now),
        ),
      )
      .limit(1)
      .execute();

    if (!user) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    if (!session) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    if (!this.tokenHashesMatch(refreshToken, session.refreshTokenHash)) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    const newRefreshToken = await this.tokenService.createRefreshToken(
      user.uid,
      session.id,
    );
    const newRefreshTokenHash = this.tokenService.hashToken(newRefreshToken);
    const newExpiresAt = new Date(
      Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000,
    );
    const updatedSessions = await db
      .update(authSessionsTable)
      .set({
        refreshTokenHash: newRefreshTokenHash,
        expiresAt: newExpiresAt,
      })
      .where(
        and(
          eq(authSessionsTable.id, session.id),
          eq(authSessionsTable.refreshTokenHash, session.refreshTokenHash),
          gt(authSessionsTable.expiresAt, now),
        ),
      )
      .returning({ id: authSessionsTable.id })
      .execute();

    if (updatedSessions.length === 0) {
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    return {
      accessToken: await this.tokenService.createAccessToken(
        user.uid,
        user.username,
      ),
      refreshToken: newRefreshToken,
      tokenType: "Bearer",
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
    };
  }

  private async createSession(user: typeof usersTable.$inferSelect) {
    const sessionId = v4();
    const refreshToken = await this.tokenService.createRefreshToken(
      user.uid,
      sessionId,
    );

    await db
      .insert(authSessionsTable)
      .values({
        id: sessionId,
        userUid: user.uid,
        refreshTokenHash: this.tokenService.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SECONDS * 1000),
      })
      .execute();

    return {
      user: this.toPublicUser(user),
      accessToken: await this.tokenService.createAccessToken(
        user.uid,
        user.username,
      ),
      refreshToken,
      tokenType: "Bearer",
      expiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshExpiresIn: REFRESH_TOKEN_TTL_SECONDS,
    };
  }

  private toPublicUser(user: typeof usersTable.$inferSelect) {
    return {
      uid: user.uid,
      username: user.username,
      email: user.email,
      name: user.name,
    };
  }

  private tokenHashesMatch(token: string, storedHash: string): boolean {
    const tokenHash = Buffer.from(this.tokenService.hashToken(token), "hex");
    const expectedHash = Buffer.from(storedHash, "hex");
    return (
      tokenHash.length === expectedHash.length &&
      timingSafeEqual(tokenHash, expectedHash)
    );
  }
}
