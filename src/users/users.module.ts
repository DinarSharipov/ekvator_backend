import { PasswordService } from "../auth/password.service";
import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";

@Module({
  controllers: [UsersController],
  providers: [UsersService, PrismaService, PasswordService],
  exports: [UsersService, PasswordService],
})
export class UsersModule {}

