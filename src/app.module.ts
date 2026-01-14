import { Module } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service";
import { ServiceElementModule } from "./service-elements/service-element.module";
import { ServiceTypesModule } from "./service-types/service-type.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [UsersModule, ServiceTypesModule, ServiceElementModule],
  controllers: [],
  providers: [PrismaService],
})
export class AppModule {}

