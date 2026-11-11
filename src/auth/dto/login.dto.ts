import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsNotEmpty, IsOptional, IsString, MaxLength } from "class-validator";

export class LoginDto {
  @ApiPropertyOptional({
    description: "Логин или телефон. Укажите login либо phone.",
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  login?: string;

  @ApiPropertyOptional({ description: "Номер телефона вместо логина" })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  phone?: string;

  @ApiProperty({ maxLength: 128 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  password: string;
}
