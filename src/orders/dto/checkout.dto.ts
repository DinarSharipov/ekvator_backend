import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsDateString, IsOptional, IsString, MaxLength } from "class-validator";

export class CheckoutDto {
  @ApiProperty({ format: "date-time", description: "Желаемое начало получения заказа" })
  @IsDateString()
  desiredStartAt: string;

  @ApiPropertyOptional({ format: "date-time", description: "Желаемое окончание (обязательно для длительного бронирования)" })
  @IsDateString()
  @IsOptional()
  desiredEndAt?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  customerNote?: string;
}
