import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash, randomUUID } from "node:crypto";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

export interface RefreshTokenClaims {
  sub: string;
  jti: string;
  tokenType: "refresh";
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(private readonly jwtService: JwtService) {}

  createAccessToken(userUid: string, username: string): Promise<string> {
    return this.jwtService.signAsync(
      { sub: userUid, username, tokenType: "access" },
      { expiresIn: ACCESS_TOKEN_TTL_SECONDS },
    );
  }

  createRefreshToken(userUid: string, sessionId: string): Promise<string> {
    return this.jwtService.signAsync(
      {
        sub: userUid,
        jti: sessionId,
        tokenType: "refresh",
        tokenId: randomUUID(),
      },
      { expiresIn: REFRESH_TOKEN_TTL_SECONDS },
    );
  }

  async verifyRefreshToken(token: string): Promise<RefreshTokenClaims> {
    let payload: Record<string, unknown>;

    try {
      payload =
        await this.jwtService.verifyAsync<Record<string, unknown>>(token);
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unknown error";
      this.logger.warn(`Refresh JWT verification failed: ${reason}`);
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    if (
      typeof payload.sub !== "string" ||
      typeof payload.jti !== "string" ||
      payload.tokenType !== "refresh"
    ) {
      this.logger.warn("Refresh JWT has invalid claims");
      throw new UnauthorizedException("Invalid or expired refresh token");
    }

    return {
      sub: payload.sub,
      jti: payload.jti,
      tokenType: "refresh",
    };
  }

  hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }
}
