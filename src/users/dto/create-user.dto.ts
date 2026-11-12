import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsEnum,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsArray,
  ArrayUnique,
  IsInt,
  Min,
  IsString,
} from "class-validator";

import { UserRole } from "../../generated/prisma/enums";

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

  @ApiPropertyOptional({ description: "Роль" })
  @IsOptional()
  @IsString()
  role?: string;

  @ApiPropertyOptional({ enum: UserRole, description: "Роль доступа" })
  @IsOptional()
  @IsEnum(UserRole)
  userRole?: UserRole;

  @ApiPropertyOptional({ type: [Number], description: "Сервисы, в которых работает менеджер или сотрудник" })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  serviceTypeIds?: number[];
}

