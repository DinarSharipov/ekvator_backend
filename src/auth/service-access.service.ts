import { ForbiddenException, Injectable } from "@nestjs/common";
import { UserRole } from "../generated/prisma/enums";

export type AuthenticatedUser = {
  id: number;
  userRole: UserRole;
  serviceAssignments: { serviceTypeId: number }[];
};

@Injectable()
export class ServiceAccessService {
  serviceTypeIds(user: AuthenticatedUser): number[] | undefined {
    return user.userRole === UserRole.admin ? undefined : user.serviceAssignments.map((assignment) => assignment.serviceTypeId);
  }

  assertCanAccessServices(user: AuthenticatedUser, serviceTypeIds: number[]) {
    if (user.userRole === UserRole.admin) return;
    const allowed = new Set(this.serviceTypeIds(user));
    if (!serviceTypeIds.length || serviceTypeIds.some((id) => !allowed.has(id))) throw new ForbiddenException("Нет доступа к указанному сервису");
  }
}
