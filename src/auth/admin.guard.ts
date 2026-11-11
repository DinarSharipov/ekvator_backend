import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { UserRole } from "../generated/prisma/enums";

/** Must run after AuthGuard, which loads the current account from the database. */
@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();
    if (user?.userRole !== UserRole.admin) {
      throw new ForbiddenException("Доступ разрешён только администраторам");
    }
    return true;
  }
}
