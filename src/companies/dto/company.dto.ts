import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsInt, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from "class-validator";

const maxMoneyMinor = 2_147_483_647;

export class CreateCompanyDto {
  @ApiProperty({ description: "Название организации", example: "ООО Транспорт" })
  @IsString() @IsNotEmpty() @MaxLength(200)
  name: string;

  @ApiPropertyOptional({ description: "ИНН организации", example: "1234567890" })
  @IsOptional() @IsString() @MaxLength(12)
  inn?: string;
}

export class AddCompanyEmployeeDto {
  @ApiPropertyOptional({ description: "ID уже зарегистрированного пользователя" })
  @IsOptional() @IsInt() @Min(1)
  userId?: number;

  @ApiPropertyOptional({ description: "Логин нового сотрудника. Укажите вместе с паролем и именем, если userId не задан." })
  @ValidateIf((dto) => dto.userId === undefined) @IsString() @IsNotEmpty()
  login?: string;

  @ApiPropertyOptional({ description: "Пароль нового сотрудника" })
  @ValidateIf((dto) => dto.userId === undefined) @IsString() @IsNotEmpty()
  password?: string;

  @ApiPropertyOptional({ description: "Имя нового сотрудника" })
  @ValidateIf((dto) => dto.userId === undefined) @IsString() @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({ description: "Телефон нового сотрудника" })
  @IsOptional() @IsString() @MaxLength(40)
  phone?: string;
}

export class CreateCompanyTopUpDto {
  @ApiProperty({ description: "Сумма в копейках. 10 000 ₽ = 1 000 000", example: 1000000 })
  @IsInt() @Min(1) @Max(maxMoneyMinor)
  amountMinor: number;

  @ApiPropertyOptional({ description: "Комментарий к заявке на пополнение" })
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class AllocateCompanyBalanceDto {
  @ApiProperty({ description: "Сумма в копейках для перевода на баланс сотрудника", example: 500000 })
  @IsInt() @Min(1) @Max(maxMoneyMinor)
  amountMinor: number;

  @ApiPropertyOptional({ description: "Комментарий к переводу" })
  @IsOptional() @IsString() @MaxLength(500)
  note?: string;
}

export class ChargeCompanyQrDto {
  @ApiProperty({ description: "QR-токен сотрудника компании" })
  @IsString() @IsNotEmpty()
  qrToken: string;

  @ApiProperty({ description: "ID товара или услуги Экватора; стоимость берётся с сервера", example: 42 })
  @IsInt() @Min(1)
  serviceElementId: number;

  @ApiPropertyOptional({ description: "Количество позиций", default: 1 })
  @IsOptional() @IsInt() @Min(1) @Max(maxMoneyMinor)
  quantity?: number;
}
