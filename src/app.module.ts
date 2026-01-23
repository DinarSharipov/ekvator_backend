import { Module } from "@nestjs/common";
import { PrismaService } from "./prisma/prisma.service";
import { ServiceElementModule } from "./service-elements/service-element.module";
import { ServiceTypesModule } from "./service-types/service-type.module";
import { UsersModule } from "./users/users.module";
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [UsersModule, ServiceTypesModule, ServiceElementModule, AuthModule],
  controllers: [],
  providers: [PrismaService],
})
export class AppModule {}

