import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from "class-validator";
import { normalizePhone } from "../../users/phone";

export class RegisterDto {
  @ApiProperty({ description: "Уникальный логин", minLength: 3, maxLength: 64 })
  @IsString()
  @Matches(/^[a-zA-Z][a-zA-Z0-9_.-]{2,63}$/, {
    message: "Логин: 3–64 символа, начинается с латинской буквы",
  })
  login: string;

  @ApiProperty({ description: "Телефон", example: "+79991234567" })
  @Transform(({ value }) => normalizePhone(value))
  @IsString()
  @Matches(/^\+[1-9]\d{10,14}$/, {
    message: "Укажите корректный номер телефона",
  })
  phone: string;

  @ApiProperty({ minLength: 8, maxLength: 128 })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @ApiPropertyOptional({
    description: "Имя пользователя; по умолчанию используется логин",
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;
}
