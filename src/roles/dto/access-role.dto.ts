import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform, Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { AccessScope } from "../../generated/prisma/enums";
import { privilegeDefinitions, PrivilegeKey } from "../../auth/privileges";

export class RoleGrantDto {
  @ApiProperty({ enum: privilegeDefinitions.map(({ key }) => key) })
  @IsIn(privilegeDefinitions.map(({ key }) => key))
  privilege: PrivilegeKey;

  @ApiProperty({ enum: AccessScope })
  @IsEnum(AccessScope)
  scope: AccessScope;
}

export class SaveAccessRoleDto {
  @ApiProperty({ maxLength: 100 })
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @ValidateIf((_dto, value) => value !== undefined)
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({
    type: () => RoleGrantDto,
    isArray: true,
    description:
      "Complete privilege set; an empty array grants no administrative operations",
  })
  @IsArray()
  @ArrayMaxSize(privilegeDefinitions.length)
  @ArrayUnique((grant) => grant?.privilege)
  @ValidateNested({ each: true })
  @Type(() => RoleGrantDto)
  grants: RoleGrantDto[];
}

export class AssignAccessRolesDto {
  @ApiProperty({
    type: [Number],
    description:
      "Complete custom role set. Empty array removes all custom roles, retaining the system access level.",
  })
  @IsArray()
  @ArrayMaxSize(100)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  roleIds: number[];
}

export class AccessRoleResponseDto {
  @ApiProperty() id: number;
  @ApiProperty() name: string;
  @ApiPropertyOptional({ type: String, nullable: true }) description:
    | string
    | null;
  @ApiProperty({ type: () => RoleGrantDto, isArray: true })
  grants: RoleGrantDto[];
  @ApiProperty({ type: String, format: "date-time" }) createdAt: Date;
  @ApiProperty({ type: String, format: "date-time" }) updatedAt: Date;
}

export class PrivilegeDefinitionDto {
  @ApiProperty() key: string;
  @ApiProperty() description: string;
  @ApiProperty() scoped: boolean;
  @ApiProperty({
    description:
      "Reserved for system administrators; cannot be delegated through custom roles",
  })
  adminOnly: boolean;
}
