import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { UserRole } from "../generated/prisma/enums";
import { rolesMetadataKey } from "./roles.decorator";

/** Must run after AuthGuard, which loads the current role from PostgreSQL. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRole[]>(rolesMetadataKey, [context.getHandler(), context.getClass()]);
    if (!roles) return true;
    const { user } = context.switchToHttp().getRequest();
    if (!user || !roles.includes(user.userRole)) throw new ForbiddenException("Недостаточно прав для этого действия");
    return true;
  }
}
