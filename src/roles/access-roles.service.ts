import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { privilegeDefinitions } from "../auth/privileges";
import { replaceUserRoles } from "./role-assignments";
import { AssignAccessRolesDto, SaveAccessRoleDto } from "./dto/access-role.dto";
import {
  lockAccessAdministration,
  requireCurrentAdministrator,
} from "./access-administration";

const roleInclude = {
  grants: {
    select: { privilege: true, scope: true },
    orderBy: { privilege: "asc" },
  },
} satisfies Prisma.AccessRoleInclude;

@Injectable()
export class AccessRolesService {
  constructor(private readonly prisma: PrismaService) {}

  definitions() {
    return this.prisma.privilege.findMany({ orderBy: { key: "asc" } });
  }
  list() {
    return this.prisma.accessRole.findMany({
      include: roleInclude,
      orderBy: { id: "asc" },
    });
  }

  async get(id: number) {
    const role = await this.prisma.accessRole.findUnique({
      where: { id },
      include: roleInclude,
    });
    if (!role) throw new NotFoundException("Роль не найдена");
    return role;
  }

  private validateGrants(dto: SaveAccessRoleDto) {
    for (const grant of dto.grants) {
      const definition = privilegeDefinitions.find(
        ({ key }) => key === grant.privilege,
      );
      if (!definition || ("adminOnly" in definition && definition.adminOnly))
        throw new BadRequestException(
          "Привилегии управления ролями нельзя делегировать",
        );
      if (!definition.scoped && grant.scope !== "all")
        throw new BadRequestException(
          "Для этой привилегии доступно только глобальное разрешение",
        );
    }
  }

  async create(actorId: number, dto: SaveAccessRoleDto) {
    this.validateGrants(dto);
    return this.mutate(actorId, (tx) =>
      tx.accessRole.create({
        data: {
          name: dto.name,
          description: dto.description,
          grants: { create: dto.grants },
        },
        include: roleInclude,
      }),
    );
  }

  async update(actorId: number, id: number, dto: SaveAccessRoleDto) {
    this.validateGrants(dto);
    return this.mutate(actorId, async (tx) => {
      await this.assertEditable(tx, id);
      return tx.accessRole.update({
        where: { id },
        data: {
          name: dto.name,
          description: dto.description ?? null,
          grants: { deleteMany: {}, create: dto.grants },
        },
        include: roleInclude,
      });
    });
  }

  async delete(actorId: number, id: number) {
    await this.mutate(actorId, async (tx) => {
      await this.assertEditable(tx, id);
      return tx.accessRole.delete({ where: { id } });
    });
  }

  async assign(actorId: number, userId: number, dto: AssignAccessRolesDto) {
    return this.mutate(actorId, async (tx) => {
      if (
        !(await tx.user.findUnique({
          where: { id: userId },
          select: { id: true },
        }))
      )
        throw new NotFoundException("Пользователь не найден");
      await replaceUserRoles(tx, userId, dto.roleIds);
    });
  }

  private async assertEditable(tx: Prisma.TransactionClient, id: number) {
    const role = await tx.accessRole.findUnique({ where: { id } });
    if (!role) throw new NotFoundException("Роль не найдена");
    if (role.isAdministrator)
      throw new ConflictException(
        "Роль администратора защищена от изменения и удаления",
      );
  }

  private async mutate<T>(
    actorId: number,
    action: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await lockAccessAdministration(tx);
        await requireCurrentAdministrator(tx, actorId);
        return action(tx);
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        if (error.code === "P2002")
          throw new ConflictException("Роль с таким названием уже существует");
        if (error.code === "P2003")
          throw new ConflictException(
            "Перед удалением роли снимите её со всех пользователей",
          );
        if (error.code === "P2025")
          throw new NotFoundException("Роль или пользователь не найдены");
      }
      throw error;
    }
  }
}
