import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { hasPrivilege, PrivilegeKey } from "./privileges";

const privilegeMetadataKey = "requiredPrivileges";
export const RequirePrivileges = (...privileges: PrivilegeKey[]) =>
  SetMetadata(privilegeMetadataKey, privileges);

/** AuthGuard must load the current account, assigned roles and grants first. */
@Injectable()
export class PrivilegesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const privileges = this.reflector.getAllAndOverride<PrivilegeKey[]>(
      privilegeMetadataKey,
      [context.getHandler(), context.getClass()],
    );
    const { user } = context.switchToHttp().getRequest();
    if (
      !privileges?.length ||
      !user ||
      privileges.some((privilege) => !hasPrivilege(user, privilege))
    ) {
      throw new ForbiddenException(
        "Недостаточно привилегий для этого действия",
      );
    }
    return true;
  }
}
