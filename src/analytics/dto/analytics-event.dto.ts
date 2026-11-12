import { Type } from "class-transformer";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsDefined, IsEnum, IsInt, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, ValidateNested } from "class-validator";
import { AnalyticsEventType } from "../../generated/prisma/enums";

export class AnalyticsEventDto {
  @IsDefined()
  @IsUUID()
  eventId: string;

  @IsDefined()
  @IsEnum(AnalyticsEventType)
  type: AnalyticsEventType;

  /** URL pathname only; query strings and fragments must not be sent. */
  @IsDefined()
  @IsString()
  @MaxLength(500)
  @Matches(/^\/[^?#]*$/)
  path: string;

  /** Stable semantic key such as cart.checkout, never a user-visible label. */
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(/^[a-z0-9][a-z0-9._:-]*$/)
  target?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  serviceTypeId?: number;

  @IsDefined()
  @IsDateString()
  occurredAt: string;
}

export class TrackAnalyticsDto {
  /** Anonymous UUID persisted by the client in localStorage or a first-party cookie. */
  @IsDefined()
  @IsUUID()
  visitorId: string;

  @IsDefined()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @Type(() => AnalyticsEventDto)
  @ValidateNested({ each: true })
  events: AnalyticsEventDto[];
}
