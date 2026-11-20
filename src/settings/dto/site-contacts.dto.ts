import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEmail, IsNotEmpty, IsNumber, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min } from "class-validator";

export class SiteContactsDto {
  @ApiProperty({ maxLength: 200 })
  @IsString() @IsNotEmpty() @MaxLength(200)
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  name: string;

  @ApiProperty({ maxLength: 500 })
  @IsString() @IsNotEmpty() @MaxLength(500)
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  address: string;

  @ApiProperty({ type: [String], minItems: 1, maxItems: 10, description: "International phone numbers, e.g. +79991234567" })
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(10)
  @IsString({ each: true }) @Matches(/^\+[1-9]\d{10,14}$/, { each: true })
  phones: string[];

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 254 })
  @IsOptional() @IsEmail() @MaxLength(254)
  email?: string | null;

  @ApiProperty({ maxLength: 500, description: "Human-readable working hours" })
  @IsString() @IsNotEmpty() @MaxLength(500)
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  workingHours: string;

  @ApiProperty({ minimum: -90, maximum: 90 })
  @IsNumber() @Min(-90) @Max(90)
  latitude: number;

  @ApiProperty({ minimum: -180, maximum: 180 })
  @IsNumber() @Min(-180) @Max(180)
  longitude: number;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional() @IsUrl({ protocols: ["http", "https"], require_protocol: true }) @MaxLength(2000)
  mapUrl?: string | null;
}

export class SiteContactsResponseDto extends SiteContactsDto {
  @ApiProperty({ type: String, format: "date-time" }) updatedAt: Date;
}
