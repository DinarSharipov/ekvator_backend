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
import {
  AuthenticatedUser,
  ServiceAccessService,
} from "../auth/service-access.service";
import {
  effectivePrivileges,
  hasGlobalPrivilege,
  hasPrivilege,
  PrivilegeKey,
} from "../auth/privileges";
import { lockAccessAdministration } from "../roles/access-administration";

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
  accessRoles: {
    select: {
      role: {
        select: {
          id: true,
          name: true,
          grants: { select: { privilege: true, scope: true } },
        },
      },
    },
  },
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
    return this.prisma.$transaction(async (tx) => {
      await lockAccessAdministration(tx);
      const currentActor = await this.currentActor(
        tx,
        actor.id,
        "users.create",
      );
      await this.assertRoleAssignment(
        currentActor,
        userRole,
        serviceTypeIds,
        undefined,
        tx,
      );
      return this.createAccount({ ...dto, userRole, serviceTypeIds }, tx);
    });
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

  private async createAccount(
    data: AccountData,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const {
      password: plainPassword,
      serviceTypeIds,
      role: legacyRole,
      ...user
    } = data;
    const password = await this.passwords.hash(plainPassword);
    try {
      return await db.user.create({
        data: {
          ...user,
          role: legacyRole ?? user.userRole,
          phoneNormalized: phoneLookupKey(user.phone),
          password,
          serviceAssignments: serviceTypeIds.length
            ? {
                create: serviceTypeIds.map((serviceTypeId) => ({
                  serviceTypeId,
                })),
              }
            : undefined,
        },
        select: publicUserSelect,
      });
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  async update(actor: AuthenticatedUser, id: number, dto: UpdateUserDTO) {
    const password =
      dto.password === undefined
        ? undefined
        : await this.passwords.hash(dto.password);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockAccessAdministration(tx);
        const currentActor = await this.currentActor(
          tx,
          actor.id,
          "users.update",
        );
        const current = await tx.user.findUnique({
          where: { id },
          select: publicUserSelect,
        });
        if (!current) throw new NotFoundException("Пользователь не найден");
        const userRole = dto.userRole ?? current.userRole;
        const serviceTypeIds =
          dto.serviceTypeIds ??
          current.serviceAssignments.map(
            (assignment) => assignment.serviceTypeId,
          );
        if (currentActor.userRole !== UserRole.admin)
          this.assertCanManageUser(currentActor, current, "users.update");
        await this.assertRoleAssignment(
          currentActor,
          userRole,
          serviceTypeIds,
          current,
          tx,
        );
        if (current.userRole === UserRole.admin && userRole !== UserRole.admin)
          await this.assertAnotherAdministrator(tx);
        const { serviceTypeIds: _serviceTypeIds, ...updates } = dto;
        const data = {
          ...updates,
          ...(dto.password !== undefined ? { password } : {}),
          ...(dto.phone !== undefined
            ? {
                phoneNormalized: phoneLookupKey(dto.phone),
                phoneVerifiedAt: null,
              }
            : {}),
        };
        return await tx.user.update({
          where: { id },
          data: {
            ...data,
            ...(dto.serviceTypeIds === undefined
              ? {}
              : {
                  serviceAssignments: {
                    deleteMany: {},
                    create: serviceTypeIds.map((serviceTypeId) => ({
                      serviceTypeId,
                    })),
                  },
                }),
          },
          select: publicUserSelect,
        });
      });
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  findAll(actor: AuthenticatedUser) {
    return this.prisma.user.findMany({
      where: hasGlobalPrivilege(actor, "users.read")
        ? undefined
        : {
            userRole: UserRole.employee,
            serviceAssignments: {
              some: {
                serviceTypeId: {
                  in: this.serviceAccess.serviceTypeIds(actor, "users.read"),
                },
              },
              every: {
                serviceTypeId: {
                  in: this.serviceAccess.serviceTypeIds(actor, "users.read"),
                },
              },
            },
          },
      orderBy: { name: "desc" },
      select: publicUserSelect,
    });
  }

  findByLogin(login: string) {
    return this.prisma.user.findUnique({ where: { login } });
  }

  async profile(id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
    if (!user) throw new NotFoundException("Пользователь не найден");
    return { ...user, privileges: effectivePrivileges(user) };
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
    if (!hasGlobalPrivilege(actor, "users.read")) {
      if (user.userRole !== UserRole.employee)
        throw new ForbiddenException("Нет доступа к пользователю");
      this.serviceAccess.assertCanAccessServices(
        actor,
        user.serviceAssignments.map((assignment) => assignment.serviceTypeId),
        "users.read",
      );
    }
    return user;
  }

  async delete(actor: AuthenticatedUser, id: number) {
    try {
      await this.prisma.$transaction(async (tx) => {
        await lockAccessAdministration(tx);
        const currentActor = await this.currentActor(
          tx,
          actor.id,
          "users.delete",
        );
        const current = await tx.user.findUnique({
          where: { id },
          select: publicUserSelect,
        });
        if (!current) throw new NotFoundException("Пользователь не найден");
        if (currentActor.userRole !== UserRole.admin)
          this.assertCanManageUser(currentActor, current, "users.delete");
        if (current.userRole === UserRole.admin)
          await this.assertAnotherAdministrator(tx);
        await tx.user.delete({ where: { id } });
      });
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  private async assertRoleAssignment(
    actor: AuthenticatedUser,
    userRole: UserRole,
    serviceTypeIds: number[],
    current?: { userRole: UserRole },
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    if (serviceTypeIds.length) {
      const count = await db.serviceType.count({
        where: { id: { in: serviceTypeIds } },
      });
      if (count !== serviceTypeIds.length)
        throw new NotFoundException("Один или несколько сервисов не найдены");
    }
    if (actor.userRole === UserRole.admin) {
      if (
        (userRole === UserRole.manager || userRole === UserRole.employee) &&
        !serviceTypeIds.length
      )
        throw new ConflictException(
          "Для менеджера или сотрудника укажите хотя бы один сервис",
        );
      return;
    }
    if (
      (userRole !== UserRole.user && userRole !== UserRole.employee) ||
      (current &&
        current.userRole !== UserRole.user &&
        current.userRole !== UserRole.employee) ||
      (actor.userRole === UserRole.manager &&
        (userRole !== UserRole.employee ||
          (current && current.userRole !== UserRole.employee)))
    ) {
      throw new ForbiddenException(
        "Менеджер может создавать и изменять только сотрудников",
      );
    }
    const privilege = current ? "users.update" : "users.create";
    this.serviceAccess.assertCanAccessServices(
      actor,
      serviceTypeIds,
      privilege,
    );
    if (userRole === UserRole.employee && !serviceTypeIds.length)
      throw new ConflictException("Для сотрудника укажите хотя бы один сервис");
  }

  private assertCanManageUser(
    actor: AuthenticatedUser,
    user: AuthenticatedUser,
    privilege: PrivilegeKey,
  ) {
    if (
      (user.userRole !== UserRole.user &&
        user.userRole !== UserRole.employee) ||
      user.accessRoles?.length
    )
      throw new ForbiddenException(
        "Учётные записи с правами доступа изменяет только администратор",
      );
    this.serviceAccess.assertCanAccessServices(
      actor,
      user.serviceAssignments.map((assignment) => assignment.serviceTypeId),
      privilege,
    );
  }

  private async currentActor(
    tx: Prisma.TransactionClient,
    id: number,
    privilege: PrivilegeKey,
  ) {
    const actor = await tx.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
    if (!actor || !hasPrivilege(actor, privilege))
      throw new ForbiddenException("Недостаточно привилегий");
    return actor;
  }

  private async assertAnotherAdministrator(tx: Prisma.TransactionClient) {
    if ((await tx.user.count({ where: { userRole: UserRole.admin } })) <= 1)
      throw new ConflictException(
        "Нельзя удалить или понизить последнего администратора",
      );
  }

  private rethrowWriteError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002")
        throw new ConflictException("Логин или телефон уже используется");
      if (error.code === "P2025")
        throw new NotFoundException("Пользователь не найден");
      if (error.code === "P2003")
        throw new ConflictException("У пользователя есть связанные данные");
    }
    throw error;
  }
}
