import { Global, Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import "dotenv/config";
import { env } from "prisma/config";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { AuthTokensService } from "./auth-tokens.service";

import { PrismaService } from "../prisma/prisma.service";
import { AuthGuard } from "./auth.guard";
import { AdminGuard } from "./admin.guard";
import { SmsVerificationService } from "./sms-verification.service";

@Global()
@Module({
  imports: [
    UsersModule,
    JwtModule.register({
      global: true,
      secret: env("JWT"),
      signOptions: { expiresIn: "1week" },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthTokensService,
    PrismaService,
    AuthGuard,
    AdminGuard,
    SmsVerificationService,
  ],
  exports: [
    AuthService,
    AuthTokensService,
    AuthGuard,
    AdminGuard,
    SmsVerificationService,
  ],
})
export class AuthModule {}
