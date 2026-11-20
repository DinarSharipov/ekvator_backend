import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsNotEmpty, ValidateIf, IsString, Max, MaxLength, Min } from "class-validator";
import { BookingMode, ServiceKind } from "../../generated/prisma/enums";

// Convert valid multipart scalars; leave malformed inputs for validation.
const multipartBoolean = ({ value }: { value: unknown }) =>
  value === "true" ? true : value === "false" ? false : value;
const multipartInteger = ({ value }: { value: unknown }) =>
  typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;

export class CreateServiceTypeDto {
  @ApiPropertyOptional({ enum: ServiceKind, default: ServiceKind.goods, description: "Goods have quantities and a start time; services have one of each selected position and a start time or period." })
  @IsEnum(ServiceKind)
  @ValidateIf((_dto, value) => value !== undefined)
  kind?: ServiceKind;

  @ApiProperty({ maxLength: 200, description: "Название сервиса" })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  name: string;

  @ApiPropertyOptional({ description: "Показывать на главной" })
  @Transform(multipartBoolean)
  @IsBoolean()
  @ValidateIf((_dto, value) => value !== undefined)
  showInMain?: boolean;

  @ApiPropertyOptional({ description: "Номер телефона" })
  @IsString()
  @ValidateIf((_dto, value) => value !== undefined)
  phone?: string;

  @ApiPropertyOptional({ description: "Второй номер телефона" })
  @IsString()
  @ValidateIf((_dto, value) => value !== undefined)
  secondPhone?: string;

  @ApiPropertyOptional({ description: "Фото" })
  @IsString()
  @ValidateIf((_dto, value) => value !== undefined)
  photo?: string;

  @ApiPropertyOptional({ description: "Описание" })
  @IsString()
  @ValidateIf((_dto, value) => value !== undefined)
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({
    description: "Тип отображения в списке (blocks/table)",
  })
  @IsString()
  @ValidateIf((_dto, value) => value !== undefined)
  @IsIn(["table", "blocks"])
  showType?: string;

  @ApiPropertyOptional({ description: "Галерея" })
  @IsString({ each: true })
  @ValidateIf((_dto, value) => value !== undefined)
  @IsArray()
  gallery?: string[];

  @ApiPropertyOptional({ description: "Сервис принимает предзаказы", default: false })
  @Transform(multipartBoolean)
  @IsBoolean()
  @ValidateIf((_dto, value) => value !== undefined)
  acceptsPreorders?: boolean;

  @ApiPropertyOptional({ description: "Можно объединять с другими сервисами в корзине", default: true })
  @Transform(multipartBoolean)
  @IsBoolean()
  @ValidateIf((_dto, value) => value !== undefined)
  allowMixedCart?: boolean;

  @ApiPropertyOptional({ enum: BookingMode, description: "appointment — точное время, duration — бронирование интервала" })
  @IsEnum(BookingMode)
  @ValidateIf((_dto, value) => value !== undefined)
  bookingMode?: BookingMode;

  @ApiPropertyOptional({ description: "Одновременная вместимость для длительного бронирования", minimum: 1, default: 1 })
  @Transform(multipartInteger)
  @IsInt()
  @Min(1)
  @Max(2_147_483_647)
  @ValidateIf((_dto, value) => value !== undefined)
  bookingCapacity?: number;

  @ApiPropertyOptional({ description: "Задел для будущей предоплаты; платежи пока не включаются", default: false })
  @Transform(multipartBoolean)
  @IsBoolean()
  @ValidateIf((_dto, value) => value !== undefined)
  prepaymentEnabled?: boolean;
}

