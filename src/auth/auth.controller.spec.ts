import { Test, TestingModule } from "@nestjs/testing";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";

describe("AuthController", () => {
  let controller: AuthController;
  let authService: {
    login: ReturnType<typeof vi.fn>;
    register: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    authService = {
      login: vi.fn(),
      register: vi.fn(),
      refresh: vi.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: authService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("uses the refresh token from the request body", async () => {
    await controller.refresh({ refreshToken: "body-token" });

    expect(authService.refresh).toHaveBeenCalledWith("body-token");
  });

  it("accepts a refresh token from the Bearer authorization header", async () => {
    await controller.refresh({}, "Bearer header-token");

    expect(authService.refresh).toHaveBeenCalledWith("header-token");
  });
});
