import { Test, TestingModule } from "@nestjs/testing";
import { AuthService } from "./auth.service.js";
import { CredentialsService } from "./credentials.service.js";
import { TokenService } from "./token.service.js";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    select: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock("../db/index.js", () => ({ db: dbMock }));

describe("AuthService", () => {
  let service: AuthService;
  let tokenService: TokenService;

  beforeEach(async () => {
    vi.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: CredentialsService,
          useValue: {
            hashPassword: vi.fn(),
            checkPassword: vi.fn(),
          },
        },
        {
          provide: TokenService,
          useValue: {
            createAccessToken: vi.fn(),
            createRefreshToken: vi.fn(),
            verifyRefreshToken: vi.fn(),
            hashToken: vi.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    tokenService = module.get<TokenService>(TokenService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  it("extends the session expiry when rotating a refresh token", async () => {
    const originalExpiry = new Date(Date.now() + 1000);
    const user = {
      uid: "user-id",
      username: "soham",
      email: "soham@example.com",
      name: "",
      password: "hashed-password",
    };
    const session = {
      id: "session-id",
      userUid: user.uid,
      expiresAt: originalExpiry,
      refreshTokenHash: "a".repeat(64),
    };
    const selectQuery = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValueOnce([user]).mockResolvedValueOnce([session]),
    };
    const updateQuery = {
      set: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      returning: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue([{ id: session.id }]),
    };

    dbMock.select.mockReturnValue(selectQuery);
    dbMock.update.mockReturnValue(updateQuery);
    vi.mocked(tokenService.verifyRefreshToken).mockResolvedValue({
      sub: user.uid,
      jti: session.id,
      tokenType: "refresh",
    });
    vi.mocked(tokenService.hashToken).mockImplementation((token) =>
      token === "old-token" ? "a".repeat(64) : "b".repeat(64),
    );
    vi.mocked(tokenService.createRefreshToken).mockResolvedValue("new-token");
    vi.mocked(tokenService.createAccessToken).mockResolvedValue("access-token");

    await service.refresh("old-token");

    const updatedSession = updateQuery.set.mock.calls[0][0];
    expect(updatedSession.refreshTokenHash).toBe("b".repeat(64));
    expect(updatedSession.expiresAt.getTime()).toBeGreaterThan(
      originalExpiry.getTime(),
    );
    expect(updatedSession.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + 6 * 24 * 60 * 60 * 1000,
    );
  });
});
