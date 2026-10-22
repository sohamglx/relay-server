import { Transform } from "class-transformer";
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidationArguments,
  ValidateIf,
} from "class-validator";

const requiredEmailMessage = ({ value }: ValidationArguments) =>
  typeof value !== "string" || !value.trim()
    ? "email is required"
    : "email must be a valid email address";

const loginEmailMessage = ({ value }: ValidationArguments) =>
  typeof value !== "string" || !value.trim()
    ? "username or email is required"
    : "email must be a valid email address";

export class createUserDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  username: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsEmail({}, { message: requiredEmailMessage })
  email: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class loginDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @ValidateIf((body: loginDto) => body.username !== undefined || !body.email)
  @IsString()
  @IsNotEmpty({ message: "username or email is required" })
  username?: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @ValidateIf((body: loginDto) => body.email !== undefined || !body.username)
  @IsEmail({}, { message: loginEmailMessage })
  email?: string;

  @IsString()
  @IsNotEmpty()
  password: string;
}

export class refreshTokenDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  refreshToken?: string;
}
