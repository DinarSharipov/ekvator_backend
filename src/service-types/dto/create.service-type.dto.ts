import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, Min } from "class-validator";
import { BookingMode } from "../../generated/prisma/enums";

export class CreateServiceTypeDto {
  @ApiProperty({ description: "Название сервиса" })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: "Показывать на главной" })
  @IsBoolean()
  @IsOptional()
  showInMain?: boolean;

  @ApiProperty({ description: "Номер телефона" })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ description: "Второй номер телефона" })
  @IsString()
  @IsOptional()
  secondPhone?: string;

  @ApiProperty({ description: "Фото" })
  @IsString()
  @IsOptional()
  photo?: string;

  @ApiPropertyOptional({ description: "Описание" })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: "Тип отображения в списке (blocks/table)",
  })
  @IsString()
  @IsOptional()
  showType?: string;

  @ApiProperty({ description: "Галерея" })
  @IsString()
  @IsOptional()
  gallery?: string[];

  @ApiPropertyOptional({ description: "Сервис принимает предзаказы", default: false })
  @IsBoolean()
  @IsOptional()
  acceptsPreorders?: boolean;

  @ApiPropertyOptional({ description: "Можно объединять с другими сервисами в корзине", default: true })
  @IsBoolean()
  @IsOptional()
  allowMixedCart?: boolean;

  @ApiPropertyOptional({ enum: BookingMode, description: "appointment — точное время, duration — бронирование интервала" })
  @IsEnum(BookingMode)
  @IsOptional()
  bookingMode?: BookingMode;

  @ApiPropertyOptional({ description: "Одновременная вместимость для длительного бронирования", minimum: 1, default: 1 })
  @IsInt()
  @Min(1)
  @IsOptional()
  bookingCapacity?: number;

  @ApiPropertyOptional({ description: "Задел для будущей предоплаты; платежи пока не включаются", default: false })
  @IsBoolean()
  @IsOptional()
  prepaymentEnabled?: boolean;
}

