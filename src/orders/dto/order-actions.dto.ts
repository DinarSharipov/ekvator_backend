import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { PreorderStatus } from "../../generated/prisma/enums";
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, MaxLength } from "class-validator";

export class ProposeScheduleDto {
  @ApiProperty({ format: "date-time" })
  @IsDateString()
  scheduledStartAt: string;

  @ApiPropertyOptional({ format: "date-time" })
  @IsDateString()
  @IsOptional()
  scheduledEndAt?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  note?: string;
}

export class SetOrderStatusDto {
  @ApiProperty({ enum: [PreorderStatus.accepted, PreorderStatus.in_progress, PreorderStatus.ready, PreorderStatus.completed, PreorderStatus.rejected, PreorderStatus.cancelled] })
  @IsEnum(PreorderStatus)
  status: PreorderStatus;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  adminNote?: string;
}

export class PostponeOrderDto {
  @ApiProperty({ format: "date-time", description: "Один раз: крайний срок, до которого клиент просит отложить получение" })
  @IsDateString()
  until: string;
}

export class ArchiveOrderDto {
  @ApiProperty()
  @IsBoolean()
  isArchived: boolean;
}
