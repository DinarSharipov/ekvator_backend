import { ApiProperty } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsBoolean, IsInt, Max, Min } from "class-validator";

export class BulkPreorderAvailabilityDto {
  @ApiProperty({ type: [Number], minItems: 1, maxItems: 1000, uniqueItems: true, example: [1, 2, 3] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(2147483647, { each: true })
  ids: number[];

  @ApiProperty({ description: "Доступность выбранных позиций для предзаказа", example: true })
  @IsBoolean()
  preorderAvailable: boolean;
}
