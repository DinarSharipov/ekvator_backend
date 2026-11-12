import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "../generated/prisma/client";
import { UserRole } from "../generated/prisma/enums";
import { PasswordService } from "../auth/password.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDTO } from "./dto/update-user.dto";
import { RegisterDto } from "../auth/dto/register.dto";
import { phoneLookupKey } from "./phone";
import { AuthenticatedUser, ServiceAccessService } from "../auth/service-access.service";

export const publicUserSelect = {
  id: true,
  name: true,
  login: true,
  surname: true,
  phone: true,
  email: true,
  telegram: true,
  role: true,
  userRole: true,
  phoneVerifiedAt: true,
  serviceAssignments: { select: { serviceTypeId: true } },
} satisfies Prisma.UserSelect;

type AccountData = {
  login: string;
  password: string;
  name: string;
  surname?: string;
  phone?: string;
  email?: string;
  telegram?: string;
  role?: string;
  userRole: UserRole;
  serviceTypeIds: number[];
};

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private passwords: PasswordService,
    private serviceAccess: ServiceAccessService,
  ) {}

  async create(actor: AuthenticatedUser, dto: CreateUserDto) {
    const userRole = dto.userRole ?? UserRole.user;
    const serviceTypeIds = dto.serviceTypeIds ?? [];
    await this.assertRoleAssignment(actor, userRole, serviceTypeIds);
    return this.createAccount({ ...dto, userRole, serviceTypeIds });
  }

  async register(dto: RegisterDto) {
    // Never spread public input into permission or verification fields.
    return this.createAccount({
      login: dto.login,
      phone: dto.phone,
      password: dto.password,
      name: dto.name ?? dto.login,
      userRole: UserRole.user,
      serviceTypeIds: [],
    });
  }

  private async createAccount(data: AccountData) {
    const { password: plainPassword, serviceTypeIds, role: legacyRole, ...user } = data;
    const password = await this.passwords.hash(plainPassword);
    try {
      return await this.prisma.user.create({
        data: {
          ...user,
          role: legacyRole ?? user.userRole,
          phoneNormalized: phoneLookupKey(user.phone),
          password,
          serviceAssignments: serviceTypeIds.length ? { create: serviceTypeIds.map((serviceTypeId) => ({ serviceTypeId })) } : undefined,
        },
        select: publicUserSelect,
      });
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  async update(actor: AuthenticatedUser, id: number, dto: UpdateUserDTO) {
    const current = await this.prisma.user.findUnique({ where: { id }, select: publicUserSelect });
    if (!current) throw new NotFoundException("Пользователь не найден");
    const userRole = dto.userRole ?? current.userRole;
    const serviceTypeIds = dto.serviceTypeIds ?? current.serviceAssignments.map((assignment) => assignment.serviceTypeId);
    await this.assertRoleAssignment(actor, userRole, serviceTypeIds, current);
    const { serviceTypeIds: _serviceTypeIds, ...updates } = dto;
    const data = {
      ...updates,
      ...(dto.password !== undefined
        ? { password: await this.passwords.hash(dto.password) }
        : {}),
      ...(dto.phone !== undefined
        ? {
            phoneNormalized: phoneLookupKey(dto.phone),
            phoneVerifiedAt: null,
          }
        : {}),
    };
    try {
      return await this.prisma.user.update({
        where: { id },
        data: {
          ...data,
          ...(dto.serviceTypeIds === undefined ? {} : { serviceAssignments: { deleteMany: {}, create: serviceTypeIds.map((serviceTypeId) => ({ serviceTypeId })) } }),
        },
        select: publicUserSelect,
      });
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  findAll(actor: AuthenticatedUser) {
    return this.prisma.user.findMany({
      where: actor.userRole === UserRole.admin ? undefined : {
        userRole: UserRole.employee,
        serviceAssignments: {
          some: { serviceTypeId: { in: this.serviceAccess.serviceTypeIds(actor) } },
          every: { serviceTypeId: { in: this.serviceAccess.serviceTypeIds(actor) } },
        },
      },
      orderBy: { name: "desc" },
      select: publicUserSelect,
    });
  }

  findByLogin(login: string) {
    return this.prisma.user.findUnique({ where: { login } });
  }

  async findForSignIn(identifier: string, phoneOnly = false) {
    if (!phoneOnly) {
      const byLogin = await this.findByLogin(identifier);
      if (byLogin) return byLogin;
    }
    const phone = phoneLookupKey(identifier);
    if (!phone) return null;
    return this.prisma.user.findUnique({ where: { phoneNormalized: phone } });
  }

  async findOne(actor: AuthenticatedUser, id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
    if (!user) return null;
    this.assertCanReadUser(actor, user);
    return user;
  }

  async delete(id: number) {
    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  private async assertRoleAssignment(actor: AuthenticatedUser, userRole: UserRole, serviceTypeIds: number[], current?: { userRole: UserRole }) {
    if (serviceTypeIds.length) {
      const count = await this.prisma.serviceType.count({ where: { id: { in: serviceTypeIds } } });
      if (count !== serviceTypeIds.length) throw new NotFoundException("Один или несколько сервисов не найдены");
    }
    if (actor.userRole === UserRole.admin) {
      if ((userRole === UserRole.manager || userRole === UserRole.employee) && !serviceTypeIds.length) throw new ConflictException("Для менеджера или сотрудника укажите хотя бы один сервис");
      return;
    }
    if (actor.userRole !== UserRole.manager || userRole !== UserRole.employee || (current && current.userRole !== UserRole.employee)) {
      throw new ForbiddenException("Менеджер может создавать и изменять только сотрудников");
    }
    this.serviceAccess.assertCanAccessServices(actor, serviceTypeIds);
  }

  private assertCanReadUser(actor: AuthenticatedUser, user: { userRole: UserRole; serviceAssignments: { serviceTypeId: number }[] }) {
    if (actor.userRole === UserRole.admin) return;
    if (actor.userRole !== UserRole.manager || user.userRole !== UserRole.employee) throw new ForbiddenException("Нет доступа к пользователю");
    this.serviceAccess.assertCanAccessServices(actor, user.serviceAssignments.map((assignment) => assignment.serviceTypeId));
  }

  private rethrowWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002")
        throw new ConflictException("Логин или телефон уже используется");
      if (error.code === "P2025")
        throw new NotFoundException("Пользователь не найден");
    }
    throw error;
  }
}
