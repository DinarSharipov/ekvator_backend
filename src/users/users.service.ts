import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";
import { Prisma } from "../generated/prisma/client";
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
  isAdministrator,
  PrivilegeKey,
} from "../auth/privileges";
import { lockAccessAdministration } from "../roles/access-administration";
import {
  assertAnotherAdministrator,
  replaceUserRoles,
} from "../roles/role-assignments";

export const publicUserSelect = {
  id: true,
  name: true,
  login: true,
  surname: true,
  phone: true,
  email: true,
  telegram: true,
  phoneVerifiedAt: true,
  serviceAssignments: { select: { serviceTypeId: true } },
  accessRoles: {
    select: {
      role: {
        select: {
          id: true,
          name: true,
          isAdministrator: true,
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
    return this.prisma.$transaction(async (tx) => {
      await lockAccessAdministration(tx);
      const currentActor = await this.currentActor(
        tx,
        actor.id,
        "users.create",
      );
      const { roleIds, serviceTypeIds = [], ...account } = dto;
      if (roleIds !== undefined && !isAdministrator(currentActor))
        throw new ForbiddenException(
          "Назначать роли может только администратор",
        );
      await this.assertServiceAssignments(
        currentActor,
        serviceTypeIds,
        "users.create",
        tx,
      );
      const user = await this.createAccount({ ...account, serviceTypeIds }, tx);
      if (roleIds !== undefined) await replaceUserRoles(tx, user.id, roleIds);
      return tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: publicUserSelect,
      });
    });
  }

  register(dto: RegisterDto) {
    return this.createAccount({
      login: dto.login,
      phone: dto.phone,
      password: dto.password,
      name: dto.name ?? dto.login,
      serviceTypeIds: [],
    });
  }

  private async createAccount(
    data: AccountData,
    db: PrismaService | Prisma.TransactionClient = this.prisma,
  ) {
    const { password: plainPassword, serviceTypeIds, ...user } = data;
    const password = await this.passwords.hash(plainPassword);
    try {
      return await db.user.create({
        data: {
          ...user,
          phoneNormalized: phoneLookupKey(user.phone),
          password,
          serviceAssignments: {
            create: serviceTypeIds.map((serviceTypeId) => ({ serviceTypeId })),
          },
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
        if (!isAdministrator(currentActor)) {
          this.assertCanManageUser(currentActor, current, "users.update");
          if (dto.serviceTypeIds !== undefined)
            this.assertCanManageUser(
              currentActor,
              {
                ...current,
                serviceAssignments: dto.serviceTypeIds.map((serviceTypeId) => ({
                  serviceTypeId,
                })),
              },
              "users.update",
            );
        }
        const { roleIds, serviceTypeIds, ...updates } = dto;
        if (roleIds !== undefined) {
          if (!isAdministrator(currentActor))
            throw new ForbiddenException(
              "Назначать роли может только администратор",
            );
          await replaceUserRoles(tx, id, roleIds);
        }
        if (serviceTypeIds !== undefined)
          await this.assertServiceAssignments(
            currentActor,
            serviceTypeIds,
            "users.update",
            tx,
          );
        return tx.user.update({
          where: { id },
          data: {
            ...updates,
            ...(dto.password !== undefined ? { password } : {}),
            ...(dto.phone !== undefined
              ? {
                  phoneNormalized: phoneLookupKey(dto.phone),
                  phoneVerifiedAt: null,
                }
              : {}),
            ...(serviceTypeIds === undefined
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
    const scope = this.serviceAccess.serviceTypeIds(actor, "users.read");
    return this.prisma.user.findMany({
      where:
        scope === undefined
          ? undefined
          : {
              accessRoles: { none: { role: { isAdministrator: true } } },
              serviceAssignments: {
                some: { serviceTypeId: { in: scope } },
                every: { serviceTypeId: { in: scope } },
              },
            },
      orderBy: { name: "desc" },
      select: publicUserSelect,
    });
  }

  findByLogin(login: string) {
    return this.prisma.user.findUnique({
      where: { login },
      include: { accessRoles: publicUserSelect.accessRoles },
    });
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
      const user = await this.findByLogin(identifier);
      if (user) return user;
    }
    const phone = phoneLookupKey(identifier);
    if (!phone) return null;
    return this.prisma.user.findUnique({
      where: { phoneNormalized: phone },
      include: { accessRoles: publicUserSelect.accessRoles },
    });
  }

  async findOne(actor: AuthenticatedUser, id: number) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
    if (!user) return null;
    if (!hasGlobalPrivilege(actor, "users.read")) {
      if (isAdministrator(user))
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
        if (!isAdministrator(currentActor))
          this.assertCanManageUser(currentActor, current, "users.delete");
        if (isAdministrator(current)) await assertAnotherAdministrator(tx);
        await tx.user.delete({ where: { id } });
      });
    } catch (error) {
      this.rethrowWriteError(error);
    }
  }

  private async assertServiceAssignments(
    actor: AuthenticatedUser,
    ids: number[],
    privilege: PrivilegeKey,
    tx: Prisma.TransactionClient,
  ) {
    if (
      (await tx.serviceType.count({ where: { id: { in: ids } } })) !==
      ids.length
    )
      throw new NotFoundException("Один или несколько сервисов не найдены");
    this.serviceAccess.assertCanAccessServices(actor, ids, privilege);
  }

  private assertCanManageUser(
    actor: AuthenticatedUser,
    user: AuthenticatedUser,
    privilege: PrivilegeKey,
  ) {
    const actorGrants = effectivePrivileges(actor);
    // Account credentials confer all of its roles: scoped account editors cannot
    // take over peers, access administrators, or users with stronger privileges.
    if (
      isAdministrator(user) ||
      effectivePrivileges(user).some(
        (grant) =>
          grant.privilege.startsWith("users.") ||
          grant.privilege.startsWith("roles.") ||
          !actorGrants.some(
            (own) =>
              own.privilege === grant.privilege &&
              (own.scope === "all" ||
                (own.scope === grant.scope &&
                  user.serviceAssignments.every((assignment) =>
                    actor.serviceAssignments.some(
                      (allowed) =>
                        allowed.serviceTypeId === assignment.serviceTypeId,
                    ),
                  ))),
          ),
      )
    )
      throw new ForbiddenException(
        "Недостаточно прав для управления этой учётной записью",
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
