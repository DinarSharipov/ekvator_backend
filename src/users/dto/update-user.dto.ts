import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsNotEmpty, IsOptional, IsString } from "class-validator";

export class UpdateUserDTO {
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
  @IsString()
  role: string;
}

