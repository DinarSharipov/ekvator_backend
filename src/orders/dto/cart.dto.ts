import { ApiProperty } from "@nestjs/swagger";
import { IsInt, Max, Min } from "class-validator";

export class AddCartItemDto {
  @ApiProperty()
  @IsInt()
  serviceElementId: number;

  @ApiProperty({ minimum: 1, maximum: 100, default: 1 })
  @IsInt()
  @Min(1)
  @Max(100)
  quantity: number;
}

export class UpdateCartItemDto {
  @ApiProperty({ minimum: 1, maximum: 100 })
  @IsInt()
  @Min(1)
  @Max(100)
  quantity: number;
}
