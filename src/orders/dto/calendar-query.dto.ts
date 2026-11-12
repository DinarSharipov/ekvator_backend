import { Transform } from "class-transformer";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, Min } from "class-validator";
import { PreorderStatus } from "../../generated/prisma/enums";

const asArray = (value: unknown) => {
  const values = Array.isArray(value) ? value : [value];
  return values.flatMap((item) => String(item).split(",")).filter(Boolean);
};

const asIds = ({ value }: { value: unknown }) => value === undefined ? undefined : asArray(value).map(Number);
const asStatuses = ({ value }: { value: unknown }) => value === undefined ? undefined : asArray(value);

export class CalendarEventsQueryDto {
  @ApiProperty({ format: "date-time", description: "Начало полуоткрытого интервала [from, to)" })
  @IsDateString()
  from: string;

  @ApiProperty({ format: "date-time", description: "Конец полуоткрытого интервала [from, to)" })
  @IsDateString()
  to: string;

  @ApiPropertyOptional({ type: [Number], description: "ID сервисов, через запятую или повторяющимся параметром" })
  @Transform(asIds)
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  serviceTypeIds?: number[];

  @ApiPropertyOptional({ type: [Number], description: "ID позиций услуг, через запятую или повторяющимся параметром" })
  @Transform(asIds)
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  serviceElementIds?: number[];

  @ApiPropertyOptional({ type: [Number], description: "ID клиентов, через запятую или повторяющимся параметром" })
  @Transform(asIds)
  @IsArray()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @IsOptional()
  userIds?: number[];

  @ApiPropertyOptional({ enum: PreorderStatus, isArray: true, description: "Статусы, через запятую или повторяющимся параметром" })
  @Transform(asStatuses)
  @IsArray()
  @IsEnum(PreorderStatus, { each: true })
  @IsOptional()
  statuses?: PreorderStatus[];

  @ApiPropertyOptional({ default: false, description: "Включить архивные заказы" })
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  @IsOptional()
  includeArchived?: boolean;
}

export class UserFilterOptionsQueryDto {
  @ApiPropertyOptional({ description: "Поиск по имени, фамилии, логину, телефону или email" })
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsOptional()
  query?: string;
}
