import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import "dotenv/config";
import { env } from "prisma/config";
import { UsersModule } from "../users/users.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

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
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}

