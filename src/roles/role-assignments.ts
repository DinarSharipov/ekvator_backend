import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "../generated/prisma/client";

/** Keep retained assignments: deleting/recreating the last admin is not safe. */
export async function replaceUserRoles(
  tx: Prisma.TransactionClient,
  userId: number,
  roleIds: number[],
) {
  if (
    (await tx.accessRole.count({ where: { id: { in: roleIds } } })) !==
    roleIds.length
  )
    throw new NotFoundException("Одна или несколько ролей не найдены");
  const removingAdmin = await tx.userAccessRole.findFirst({
    where: {
      userId,
      roleId: { notIn: roleIds },
      role: { isAdministrator: true },
    },
  });
  if (removingAdmin) await assertAnotherAdministrator(tx);
  await tx.userAccessRole.deleteMany({
    where: { userId, roleId: { notIn: roleIds } },
  });
  await tx.userAccessRole.createMany({
    data: roleIds.map((roleId) => ({ userId, roleId })),
    skipDuplicates: true,
  });
}

export async function assertAnotherAdministrator(tx: Prisma.TransactionClient) {
  const state = await tx.administratorState.findUniqueOrThrow({
    where: { id: 1 },
  });
  if (state.count <= 1)
    throw new ConflictException(
      "Нельзя удалить или лишить роли последнего администратора",
    );
}
