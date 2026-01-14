import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ServiceTypesController } from "./service-type.controller";
import { ServiceTypeService } from "./service-type.service";

@Module({
  controllers: [ServiceTypesController],
  providers: [ServiceTypeService, PrismaService],
  exports: [ServiceTypeService],
})
export class ServiceTypesModule {}

