const names = { manager: "Менеджер", employee: "Сотрудник" };

async function roleId(prisma, kind) {
  if (kind === "user") return undefined;
  const role = await prisma.accessRole.findFirstOrThrow({
    where: kind === "admin" ? { isAdministrator: true } : { name: names[kind] },
  });
  return role.id;
}
async function roleData(prisma, kind) {
  const id = await roleId(prisma, kind);
  return id === undefined ? {} : { accessRoles: { create: { roleId: id } } };
}
async function setRoles(prisma, userId, kind) {
  const id = await roleId(prisma, kind);
  return prisma.$transaction(async (tx) => {
    await tx.userAccessRole.deleteMany({
      where: { userId, ...(id ? { roleId: { not: id } } : {}) },
    });
    if (id)
      await tx.userAccessRole.createMany({
        data: [{ userId, roleId: id }],
        skipDuplicates: true,
      });
  });
}
module.exports = { roleId, roleData, setRoles };
