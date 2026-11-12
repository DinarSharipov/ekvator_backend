import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class WeatherResponseDto {
  @ApiProperty({ example: "2026-11-12T12:00" })
  time: string;

  @ApiProperty({ example: 5.2 })
  temperature: number;

  @ApiPropertyOptional({ example: 81, nullable: true })
  humidity: number | null;

  @ApiPropertyOptional({ example: 1008.4, nullable: true })
  pressure: number | null;

  @ApiPropertyOptional({ example: 3, nullable: true })
  weatherCode: number | null;

  @ApiProperty({ example: true })
  isCurrent: boolean;
}

export class WeatherErrorDto {
  @ApiProperty({ example: 502 })
  statusCode: number;

  @ApiProperty({ example: "WEATHER_PROVIDER_UNAVAILABLE" })
  code: string;

  @ApiProperty({ example: "Weather provider is unavailable" })
  message: string;
}

export class WeatherValidationErrorDto {
  @ApiProperty({ example: 400 })
  statusCode: number;

  @ApiProperty({ example: ["latitude must not be greater than 90"], type: [String] })
  message: string[];

  @ApiProperty({ example: "Bad Request" })
  error: string;
}
