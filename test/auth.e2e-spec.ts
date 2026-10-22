import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { App } from "supertest/types.js";
import { CredentialsService } from "../src/auth/credentials.service.js";
import { TokenService } from "../src/auth/token.service.js";
import { AppModule } from "../src/app.module.js";

const {
  dbMock,
  selectResults,
  insertResults,
  updateResults,
  insertedValues,
  updatedValues,
} = vi.hoisted(() => {
  const selectResults: Record<string, unknown>[][] = [];
  const insertResults: Record<string, unknown>[][] = [];
  const updateResults: Record<string, unknown>[][] = [];
  const insertedValues: Record<string, unknown>[] = [];
  const updatedValues: Record<string, unknown>[] = [];

  const makeQuery = (results: Record<string, unknown>[][]) => {
    let query: {
      from: ReturnType<typeof vi.fn>;
      where: ReturnType<typeof vi.fn>;
      limit: ReturnType<typeof vi.fn>;
      values: ReturnType<typeof vi.fn>;
      set: ReturnType<typeof vi.fn>;
      returning: ReturnType<typeof vi.fn>;
      execute: ReturnType<typeof vi.fn>;
    };

    query = {
      from: vi.fn(() => query),
      where: vi.fn(() => query),
      limit: vi.fn(() => query),
      values: vi.fn((value: Record<string, unknown>) => {
        insertedValues.push(value);
        return query;
      }),
      set: vi.fn((value: Record<string, unknown>) => {
        updatedValues.push(value);
        return query;
      }),
      returning: vi.fn(() => query),
      execute: vi.fn(async () => results.shift() ?? []),
    };

    return query;
  };

  return {
    dbMock: {
      select: vi.fn(() => makeQuery(selectResults)),
      insert: vi.fn(() => makeQuery(insertResults)),
      update: vi.fn(() => makeQuery(updateResults)),
    },
    selectResults,
    insertResults,
    updateResults,
    insertedValues,
    updatedValues,
  };
});

vi.mock("../src/db/index.js", () => ({ db: dbMock }));

describe("Authentication (e2e)", () => {
  let app: INestApplication<App>;
  let credentialsService: {
    hashPassword: ReturnType<typeof vi.fn>;
    checkPassword: ReturnType<typeof vi.fn>;
  };
  let tokenService: TokenService;

  const user = {
    uid: "2b396390-6ec4-4b11-a053-ec207eb3bc36",
    username: "soham",
    email: "soham@example.com",
    name: "",
    password: "hashed-password",
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.JWT_SECRET = "e2e-test-secret";
    selectResults.length = 0;
    insertResults.length = 0;
    updateResults.length = 0;
    insertedValues.length = 0;
    updatedValues.length = 0;

    credentialsService = {
      hashPassword: vi.fn().mockResolvedValue("hashed-password"),
      checkPassword: vi.fn().mockResolvedValue(true),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(CredentialsService)
      .useValue(credentialsService)
      .compile();

    app = moduleFixture.createNestApplication();
    tokenService = app.get(TokenService);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("serves the root endpoint", async () => {
    await request(app.getHttpServer())
      .get("/")
      .expect(200)
      .expect("Hello World!");
  });

  it("registers a user, hashes the password, and creates a refresh session", async () => {
    selectResults.push([]);
    insertResults.push([user], []);

    const response = await request(app.getHttpServer())
      .post("/auth/reg")
      .send({
        username: " soham ",
        email: " soham@example.com ",
        password: "password",
      })
      .expect(201);

    expect(credentialsService.hashPassword).toHaveBeenCalledWith("password");
    expect(response.body).toMatchObject({
      user: {
        uid: user.uid,
        username: user.username,
        email: user.email,
        name: "",
      },
      tokenType: "Bearer",
      expiresIn: 900,
      refreshExpiresIn: 604800,
    });
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toEqual(expect.any(String));
    expect(response.body.user.password).toBeUndefined();
    expect(insertedValues[0]).toMatchObject({
      username: user.username,
      email: user.email,
      password: "hashed-password",
    });
    expect(insertedValues[1]).toMatchObject({
      userUid: user.uid,
      refreshTokenHash: tokenService.hashToken(response.body.refreshToken),
    });
  });

  it("rejects registration with missing fields", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/reg")
      .send({ username: "soham" })
      .expect(400);

    expect(response.body).toMatchObject({
      message: "Validation failed",
      details: expect.arrayContaining([
        { field: "email", message: expect.any(String) },
        { field: "password", message: expect.any(String) },
      ]),
    });
    expect(dbMock.select).not.toHaveBeenCalled();
    expect(credentialsService.hashPassword).not.toHaveBeenCalled();
  });

  it("rejects registration with an invalid email and identifies the field", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/reg")
      .send({
        username: "soham",
        email: "not-an-email",
        password: "password",
      })
      .expect(400);

    expect(response.body.details).toEqual(
      expect.arrayContaining([
        { field: "email", message: "email must be a valid email address" },
      ]),
    );
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("rejects duplicate registration", async () => {
    selectResults.push([{ uid: user.uid }]);

    const response = await request(app.getHttpServer())
      .post("/auth/reg")
      .send({
        username: user.username,
        email: user.email,
        password: "password",
      })
      .expect(409);

    expect(response.body.message).toBe(
      "Username or email is already registered",
    );
    expect(credentialsService.hashPassword).not.toHaveBeenCalled();
  });

  it.each([
    ["email", { email: user.email, password: "password" }],
    ["username", { username: user.username, password: "password" }],
  ])("logs in using %s and creates a token pair", async (_label, body) => {
    selectResults.push([user]);
    insertResults.push([]);

    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send(body)
      .expect(200);

    expect(credentialsService.checkPassword).toHaveBeenCalledWith(
      "password",
      user.password,
    );
    expect(response.body).toMatchObject({
      user: {
        uid: user.uid,
        username: user.username,
        email: user.email,
        name: "",
      },
      tokenType: "Bearer",
      expiresIn: 900,
      refreshExpiresIn: 604800,
    });
    expect(response.body.accessToken).toEqual(expect.any(String));
    expect(response.body.refreshToken).toEqual(expect.any(String));
  });

  it("rejects login when the password does not match", async () => {
    selectResults.push([user]);
    credentialsService.checkPassword.mockResolvedValue(false);

    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: user.email, password: "wrong-password" })
      .expect(401);

    expect(response.body.message).toBe("Invalid username/email or password");
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("rejects login when no account matches", async () => {
    selectResults.push([]);

    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: user.email, password: "password" })
      .expect(401);

    expect(response.body.message).toBe("Invalid username/email or password");
    expect(credentialsService.checkPassword).not.toHaveBeenCalled();
  });

  it("rejects login when the identifier or password is missing", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ email: user.email })
      .expect(400);

    expect(response.body).toMatchObject({
      message: "Validation failed",
      details: expect.arrayContaining([
        { field: "password", message: expect.any(String) },
      ]),
    });
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("identifies that login requires a username or email", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/login")
      .send({ password: "password" })
      .expect(400);

    expect(response.body.details).toEqual(
      expect.arrayContaining([
        { field: "username", message: "username or email is required" },
        { field: "email", message: "username or email is required" },
      ]),
    );
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it.each(["body", "authorization header"])(
    "refreshes and rotates a token supplied in the %s",
    async (location) => {
      const sessionId = "80e73008-a619-41a4-99a1-6085f08c38e2";
      const refreshToken = await tokenService.createRefreshToken(
        user.uid,
        sessionId,
      );
      const session = {
        id: sessionId,
        userUid: user.uid,
        refreshTokenHash: tokenService.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + 60_000),
      };
      selectResults.push([user], [session]);
      updateResults.push([{ id: sessionId }]);

      const testRequest = request(app.getHttpServer()).post("/auth/refresh");
      if (location === "body") {
        testRequest.send({ refreshToken });
      } else {
        testRequest.set("Authorization", `Bearer ${refreshToken}`);
      }

      const response = await testRequest.expect(200);

      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(response.body.refreshToken).toEqual(expect.any(String));
      expect(response.body.refreshToken).not.toBe(refreshToken);
      expect(response.body.tokenType).toBe("Bearer");
      expect(response.body.expiresIn).toBe(900);
      expect(response.body.refreshExpiresIn).toBe(604800);

      expect(updatedValues[0]?.refreshTokenHash).toBe(
        tokenService.hashToken(response.body.refreshToken),
      );
      const updatedExpiry = updatedValues[0]?.expiresAt;
      expect(updatedExpiry).toBeInstanceOf(Date);
      if (!(updatedExpiry instanceof Date)) {
        throw new Error("Refresh rotation did not update the session expiry");
      }
      expect(updatedExpiry.getTime()).toBeGreaterThan(
        session.expiresAt.getTime(),
      );
    },
  );

  it("rejects an invalid refresh token", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken: "not-a-jwt" })
      .expect(401);

    expect(response.body.message).toBe("Invalid or expired refresh token");
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("rejects a refresh request with no token", async () => {
    const response = await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({})
      .expect(401);

    expect(response.body.message).toBe("Invalid or expired refresh token");
    expect(response.body.details).toEqual([
      {
        field: "refreshToken",
        message:
          "refreshToken is required in the request body or Authorization Bearer header",
      },
    ]);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it("rejects a valid refresh token when its session is missing or expired", async () => {
    const refreshToken = await tokenService.createRefreshToken(
      user.uid,
      "80e73008-a619-41a4-99a1-6085f08c38e2",
    );
    selectResults.push([user], []);

    const response = await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken })
      .expect(401);

    expect(response.body.message).toBe("Invalid or expired refresh token");
    expect(dbMock.update).not.toHaveBeenCalled();
  });

  it("rejects reuse of a refresh token after rotation", async () => {
    const sessionId = "80e73008-a619-41a4-99a1-6085f08c38e2";
    const refreshToken = await tokenService.createRefreshToken(
      user.uid,
      sessionId,
    );
    const session = {
      id: sessionId,
      userUid: user.uid,
      refreshTokenHash: tokenService.hashToken(refreshToken),
      expiresAt: new Date(Date.now() + 60_000),
    };

    selectResults.push([user], [session]);
    updateResults.push([{ id: sessionId }]);
    const rotated = await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken })
      .expect(200);

    session.refreshTokenHash = tokenService.hashToken(
      rotated.body.refreshToken,
    );
    selectResults.push([user], [session]);
    const response = await request(app.getHttpServer())
      .post("/auth/refresh")
      .send({ refreshToken })
      .expect(401);

    expect(response.body.message).toBe("Invalid or expired refresh token");
  });
});
