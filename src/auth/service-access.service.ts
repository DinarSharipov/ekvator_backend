import { ForbiddenException, Injectable } from "@nestjs/common";
import { UserRole } from "../generated/prisma/enums";
import { AccessUser, hasGlobalPrivilege, PrivilegeKey } from "./privileges";

export type AuthenticatedUser = AccessUser & {
  id: number;
  userRole: UserRole;
  serviceAssignments: { serviceTypeId: number }[];
};

@Injectable()
export class ServiceAccessService {
  serviceTypeIds(user: AuthenticatedUser, privilege?: PrivilegeKey): number[] | undefined {
    return user.userRole === UserRole.admin || (privilege && hasGlobalPrivilege(user, privilege)) ? undefined : user.serviceAssignments.map((assignment) => assignment.serviceTypeId);
  }

  assertCanAccessServices(user: AuthenticatedUser, serviceTypeIds: number[], privilege?: PrivilegeKey) {
    const scope = this.serviceTypeIds(user, privilege);
    if (scope === undefined) return;
    const allowed = new Set(scope);
    if (!serviceTypeIds.length || serviceTypeIds.some((id) => !allowed.has(id))) throw new ForbiddenException("Нет доступа к указанному сервису");
  }
}
