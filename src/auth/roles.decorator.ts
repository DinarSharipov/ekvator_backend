import { SetMetadata } from "@nestjs/common";
import { UserRole } from "../generated/prisma/enums";

export const rolesMetadataKey = "roles";
export const Roles = (...roles: UserRole[]) => SetMetadata(rolesMetadataKey, roles);
