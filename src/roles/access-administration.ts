import { ForbiddenException } from "@nestjs/common";
import { isAdministrator } from "../auth/privileges";
import { Prisma } from "../generated/prisma/client";

export async function lockAccessAdministration(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(74162, 1)`;
}

export async function requireCurrentAdministrator(
  tx: Prisma.TransactionClient,
  actorId: number,
) {
  const actor = await tx.user.findUnique({
    where: { id: actorId },
    select: {
      accessRoles: {
        select: {
          role: {
            select: {
              isAdministrator: true,
              grants: { select: { privilege: true, scope: true } },
            },
          },
        },
      },
    },
  });
  if (!isAdministrator(actor))
    throw new ForbiddenException(
      "Управлять ролями может только системный администратор",
    );
}
