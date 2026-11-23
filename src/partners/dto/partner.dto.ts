import { ApiProperty, ApiPropertyOptional, PartialType } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min } from "class-validator";

export class PartnerIdDto {
  @Type(() => Number)
  @IsInt() @Min(1) @Max(2147483647)
  id: number;
}

export class CreatePartnerDto {
  @ApiProperty({ maxLength: 200 })
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString() @IsNotEmpty() @MaxLength(200)
  name: string;

  @ApiProperty({ maxLength: 90000, description: "Base64 or image data URL (PNG, JPEG, GIF, WebP). Maximum 90000 characters including prefix." })
  @IsString() @IsNotEmpty() @MaxLength(90000)
  @Matches(/^(?:data:image\/(?:png|jpeg|gif|webp);base64,)?(?=[A-Za-z0-9+/])(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
  image: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2000 })
  @IsOptional() @IsUrl({ protocols: ["http", "https"], require_protocol: true }) @MaxLength(2000)
  site?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 254 })
  @IsOptional() @IsEmail() @MaxLength(254)
  email?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 50 })
  @IsOptional() @IsString() @MaxLength(50)
  phone?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @IsOptional() @IsString() @MaxLength(200)
  person?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, pattern: "^(?:[0-9]{10}|[0-9]{12})$" })
  @IsOptional() @IsString() @Matches(/^(?:[0-9]{10}|[0-9]{12})$/)
  inn?: string | null;
}

// Undefined preserves a field; null is accepted only for nullable fields.
export class UpdatePartnerDto extends PartialType(CreatePartnerDto, { skipNullProperties: false }) {}

export class PartnerResponseDto extends CreatePartnerDto {
  @ApiProperty({ minimum: 1, readOnly: true })
  id: number;
}
