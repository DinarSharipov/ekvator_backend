import { ForbiddenException } from "@nestjs/common";
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
    select: { userRole: true },
  });
  if (actor?.userRole !== "admin")
    throw new ForbiddenException(
      "Управлять ролями может только системный администратор",
    );
}
