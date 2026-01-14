import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { ServiceElementsController } from "./service-element.controller";
import { ServiceElementService } from "./service-element.service";

@Module({
  controllers: [ServiceElementsController],
  providers: [ServiceElementService, PrismaService],
  exports: [ServiceElementService],
})
export class ServiceElementModule {}

