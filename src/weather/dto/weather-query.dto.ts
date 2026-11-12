import { Transform } from "class-transformer";
import { ApiProperty } from "@nestjs/swagger";
import { IsDateString, IsNumber, Max, Min } from "class-validator";

const asNumber = ({ value }: { value: unknown }) => Number(value);

export class WeatherQueryDto {
  @ApiProperty({ example: 55.7887, minimum: -90, maximum: 90 })
  @Transform(asNumber)
  @IsNumber()
  @Min(-90)
  @Max(90)
  latitude: number;

  @ApiProperty({ example: 49.1221, minimum: -180, maximum: 180 })
  @Transform(asNumber)
  @IsNumber()
  @Min(-180)
  @Max(180)
  longitude: number;

  @ApiProperty({ example: "2026-11-12", format: "date", description: "UTC calendar date" })
  @IsDateString()
  date: string;
}
