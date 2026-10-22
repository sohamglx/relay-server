import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
} from "@nestjs/common";
import { AuthService } from "./auth.service.js";
import { createUserDto, loginDto, refreshTokenDto } from "../dto/auth.dto.js";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body() body: loginDto) {
    return this.authService.login(body);
  }

  @Post("reg")
  register(@Body() body: createUserDto) {
    return this.authService.register(body);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  refresh(
    @Body() body: refreshTokenDto,
    @Headers("authorization") authorization?: string,
  ) {
    const headerToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    return this.authService.refresh(body?.refreshToken ?? headerToken);
  }
}
