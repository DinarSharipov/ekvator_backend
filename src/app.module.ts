import { Module } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service";
import { ServiceTypesModule } from "./service-types/service-type.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [UsersModule, ServiceTypesModule],
  controllers: [],
  providers: [PrismaService],
})
export class AppModule {}

