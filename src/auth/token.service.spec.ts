import { JwtService } from "@nestjs/jwt";
import { UnauthorizedException } from "@nestjs/common";
import { TokenService } from "./token.service.js";

describe("TokenService", () => {
  const service = new TokenService(new JwtService({ secret: "test-secret" }));

  it("verifies refresh tokens and returns their session claims", async () => {
    const refreshToken = await service.createRefreshToken(
      "user-id",
      "session-id",
    );

    await expect(service.verifyRefreshToken(refreshToken)).resolves.toEqual({
      sub: "user-id",
      jti: "session-id",
      tokenType: "refresh",
    });
  });

  it("creates a unique token when rotating within the same second", async () => {
    const firstToken = await service.createRefreshToken(
      "user-id",
      "session-id",
    );
    const secondToken = await service.createRefreshToken(
      "user-id",
      "session-id",
    );

    expect(secondToken).not.toBe(firstToken);
  });

  it("rejects access tokens as refresh tokens", async () => {
    const accessToken = await service.createAccessToken("user-id", "soham");

    await expect(
      service.verifyRefreshToken(accessToken),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects invalid refresh tokens", async () => {
    await expect(service.verifyRefreshToken("invalid")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
