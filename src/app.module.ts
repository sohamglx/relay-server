import {
  BadRequestException,
  Module,
  ValidationPipe,
} from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_PIPE } from "@nestjs/core";
import { ValidationError } from "class-validator";
import { AppController } from "./app.controller.js";
import { AppService } from "./app.service.js";
import { AuthModule } from "./auth/auth.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    AuthModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useFactory: () =>
        new ValidationPipe({
          transform: true,
          whitelist: true,
          forbidNonWhitelisted: true,
          exceptionFactory: (errors: ValidationError[]) =>
            new BadRequestException({
              statusCode: 400,
              error: "Bad Request",
              message: "Validation failed",
              details: errors.flatMap((validationError) =>
                Object.values(validationError.constraints ?? {}).map(
                  (message) => ({
                    field: validationError.property,
                    message,
                  }),
                ),
              ),
            }),
        }),
    },
  ],
})
export class AppModule {}
