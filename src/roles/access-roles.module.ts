import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { AccessRolesController } from "./access-roles.controller";
import { AccessRolesService } from "./access-roles.service";

@Module({
  controllers: [AccessRolesController],
  providers: [PrismaService, AccessRolesService],
})
export class AccessRolesModule {}
