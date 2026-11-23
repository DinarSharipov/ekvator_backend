import { Module } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { PartnersController } from "./partners.controller";
import { PartnersService } from "./partners.service";

@Module({ controllers: [PartnersController], providers: [PrismaService, PartnersService] })
export class PartnersModule {}
