import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller.js";
import { AuthService } from "./auth.service.js";
import { CredentialsService } from "./credentials.service.js";
import { PasswordHasher } from "@nestjs/authentication";
import { JwtModule } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { TokenService } from "./token.service.js";

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const secret = configService.getOrThrow<string>("JWT_SECRET");
        if (!secret.trim()) {
          throw new Error("JWT_SECRET must not be empty");
        }

        return {
          secret,
          signOptions: { algorithm: "HS256" as const },
          verifyOptions: { algorithms: ["HS256"] as const },
        };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, CredentialsService, PasswordHasher, TokenService],
})
export class AuthModule {}
