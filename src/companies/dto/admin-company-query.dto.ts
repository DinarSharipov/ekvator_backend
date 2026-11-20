import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEnum, IsInt, IsString, Max, MaxLength, Min, ValidateIf } from "class-validator";
import { CompanyTopUpStatus } from "../../generated/prisma/enums";

const integer = ({ value }: { value: unknown }) => typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;

export class AdminCompanyQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1, maximum: 1_000_000 })
  @Transform(integer) @IsInt() @Min(1) @Max(1_000_000)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @Transform(integer) @IsInt() @Min(1) @Max(100)
  limit: number = 20;

  @ApiPropertyOptional({ description: "Case-insensitive company name or INN search", maxLength: 200 })
  @ValidateIf((_dto, value) => value !== undefined) @IsString() @MaxLength(200)
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  query?: string;
}

export class AdminTopUpQueryDto extends AdminCompanyQueryDto {
  @ApiPropertyOptional({ enum: CompanyTopUpStatus, description: "Omit to include all statuses" })
  @ValidateIf((_dto, value) => value !== undefined) @IsEnum(CompanyTopUpStatus)
  status?: CompanyTopUpStatus;

  @ApiPropertyOptional({ minimum: 1 })
  @ValidateIf((_dto, value) => value !== undefined) @Transform(integer) @IsInt() @Min(1) @Max(2_147_483_647)
  companyId?: number;
}
