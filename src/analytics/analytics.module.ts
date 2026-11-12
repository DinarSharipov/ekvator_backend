import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AnalyticsController, AdminAnalyticsController } from "./analytics.controller";
import { AnalyticsIdentityService } from "./analytics-identity.service";
import { AnalyticsService } from "./analytics.service";

@Module({
  imports: [AuthModule],
  controllers: [AnalyticsController, AdminAnalyticsController],
  providers: [AnalyticsService, AnalyticsIdentityService],
})
export class AnalyticsModule {}
