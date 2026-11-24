import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";

export class M7NewsQueryDto {
  @ApiPropertyOptional({ enum: ["all", "traffic"], default: "all" })
  @IsOptional()
  @IsIn(["all", "traffic"])
  category: "all" | "traffic" = "all";

  @ApiPropertyOptional({ enum: ["24h", "7d", "30d"], default: "7d" })
  @IsOptional()
  @IsIn(["24h", "7d", "30d"])
  period: "24h" | "7d" | "30d" = "7d";
}

export class NewsArticleDto {
  @ApiProperty() url: string;
  @ApiProperty() title: string;
  @ApiProperty({ description: "GDELT discovery time, not the time of the incident", example: "20261124T100000Z" }) seendate: string;
  @ApiProperty() domain: string;
  @ApiProperty() sourcecountry: string;
  @ApiProperty() language: string;
}

export class M7NewsResponseDto {
  @ApiProperty({ type: [NewsArticleDto], maxItems: 50 }) articles: NewsArticleDto[];
  @ApiProperty({ format: "date-time", description: "Time of the last successful fetch; preserved on failure" }) fetchedAt: string;
  @ApiProperty() stale: boolean;
}
