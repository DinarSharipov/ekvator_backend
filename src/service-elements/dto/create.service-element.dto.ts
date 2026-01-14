import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsDate,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from "class-validator";

export class CreateServiceElementDto {
  @ApiProperty({ description: "Название услуги/продукта" })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ description: "Описание" })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: "Цена", default: 0 })
  @IsInt()
  price: number;

  @ApiProperty({ description: "Фотографии" })
  @IsString()
  @IsOptional()
  photos?: string[];

  @ApiProperty({ description: "Внимание: id типа сервиса" })
  @IsInt()
  type: number;

  @ApiPropertyOptional({ description: "Дата создания" })
  @IsDate()
  @IsOptional()
  createdDate?: string;

  @ApiProperty({ description: "Архивная услуга" })
  @IsBoolean()
  @IsOptional()
  isArchive?: boolean;
}

