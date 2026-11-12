import { IsDateString, IsOptional } from "class-validator";

export class AnalyticsOverviewDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}
