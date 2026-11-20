import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ArrayUnique,
  ArrayMaxSize,
  IsInt,
  Min,
  IsString,
  ValidateIf,
} from "class-validator";

export class CreateUserDto {
  @ApiProperty({ description: "Логин" })
  @IsString()
  @IsNotEmpty()
  login: string;

  @ApiProperty({ description: "Пароль" })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ description: "Имя пользователя" })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ description: "Фамилия пользователя" })
  @IsString()
  @IsNotEmpty()
  surname: string;

  @ApiProperty({ description: "Телефон пользователя" })
  @IsString()
  @IsNotEmpty()
  phone: string;

  @ApiPropertyOptional({ description: "Email пользователя" })
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({ description: "Telegram пользователя" })
  @IsString()
  @IsOptional()
  telegram?: string;

  @ApiPropertyOptional({
    type: [Number],
    description: "Complete role set; only administrators can assign roles.",
  })
  @ValidateIf((_dto, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  roleIds?: number[];

  @ApiPropertyOptional({
    type: [Number],
    description: "Сервисы, в которых работает менеджер или сотрудник",
  })
  @ValidateIf((_dto, value) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  serviceTypeIds?: number[];
}
