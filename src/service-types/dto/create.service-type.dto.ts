import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from "class-validator";

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
}

