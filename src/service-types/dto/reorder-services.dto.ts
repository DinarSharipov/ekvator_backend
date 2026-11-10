import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayNotEmpty, ArrayUnique, IsArray, IsInt, Min } from "class-validator";

export class ReorderServicesDto {
  @ApiProperty({ type: [Number], description: "Все ID сервисов в новом порядке", example: [6, 3, 7, 8, 4, 5] })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids: number[];
}
