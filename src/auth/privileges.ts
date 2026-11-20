import { UserRole } from "../generated/prisma/enums";

// Fixed operation keys; administrators compose roles from this catalogue.
export const privilegeDefinitions = [
  {
    key: "services.create",
    description: "Создание направлений",
    scoped: false,
  },
  {
    key: "services.update",
    description: "Изменение направлений",
    scoped: true,
  },
  {
    key: "services.delete",
    description: "Удаление направлений",
    scoped: false,
  },
  {
    key: "services.reorder",
    description: "Изменение порядка направлений",
    scoped: false,
  },
  {
    key: "items.create",
    description: "Создание товаров и услуг",
    scoped: true,
  },
  {
    key: "items.update",
    description: "Редактирование и архивация товаров и услуг",
    scoped: true,
  },
  {
    key: "items.delete",
    description: "Удаление товаров и услуг",
    scoped: true,
  },
  { key: "orders.read", description: "Просмотр рабочих заказов", scoped: true },
  {
    key: "orders.status",
    description: "Изменение статусов заказов",
    scoped: true,
  },
  {
    key: "orders.schedule",
    description: "Согласование времени заказов",
    scoped: true,
  },
  { key: "orders.archive", description: "Архивация заказов", scoped: true },
  {
    key: "calendar.read",
    description: "Просмотр календаря и его фильтров",
    scoped: true,
  },
  { key: "users.read", description: "Просмотр пользователей", scoped: true },
  {
    key: "users.create",
    description: "Создание обычных пользователей и сотрудников",
    scoped: true,
  },
  {
    key: "users.update",
    description: "Редактирование обычных пользователей и сотрудников",
    scoped: true,
  },
  {
    key: "users.delete",
    description: "Удаление обычных пользователей и сотрудников",
    scoped: true,
  },
  {
    key: "companies.read",
    description: "Просмотр всех компаний",
    scoped: false,
  },
  {
    key: "companies.manage",
    description: "Управление участниками, депозитами и журналом компаний",
    scoped: false,
  },
  {
    key: "topups.read",
    description: "Просмотр заявок на пополнение компаний",
    scoped: false,
  },
  {
    key: "topups.confirm",
    description: "Подтверждение поступления денег компаний",
    scoped: false,
  },
  {
    key: "companies.charge",
    description: "Списание корпоративного депозита по QR",
    scoped: true,
  },
  { key: "analytics.read", description: "Просмотр аналитики", scoped: false },
  {
    key: "settings.update",
    description: "Редактирование контактов комплекса",
    scoped: false,
  },
  {
    key: "roles.read",
    description: "Просмотр ролей и привилегий",
    scoped: false,
    adminOnly: true,
  },
  {
    key: "roles.create",
    description: "Создание ролей",
    scoped: false,
    adminOnly: true,
  },
  {
    key: "roles.update",
    description: "Редактирование ролей и их привилегий",
    scoped: false,
    adminOnly: true,
  },
  {
    key: "roles.delete",
    description: "Удаление ролей",
    scoped: false,
    adminOnly: true,
  },
  {
    key: "roles.assign",
    description: "Назначение ролей и системных уровней доступа",
    scoped: false,
    adminOnly: true,
  },
] as const;

export type PrivilegeKey = (typeof privilegeDefinitions)[number]["key"];
export type PrivilegeGrant = {
  privilege: PrivilegeKey;
  scope: "all" | "assigned";
};
export type AccessUser = {
  userRole: UserRole;
  accessRoles?: {
    role: { grants: { privilege: string; scope: "all" | "assigned" }[] };
  }[];
};

const managerPrivileges: PrivilegeKey[] = [
  "items.create",
  "items.update",
  "items.delete",
  "orders.read",
  "orders.status",
  "orders.schedule",
  "orders.archive",
  "calendar.read",
  "users.read",
  "users.create",
  "users.update",
  "companies.charge",
];
const employeePrivileges: PrivilegeKey[] = [
  "orders.read",
  "orders.status",
  "calendar.read",
];

export function effectivePrivileges(user: AccessUser): PrivilegeGrant[] {
  if (user.userRole === UserRole.admin)
    return privilegeDefinitions.map(({ key }) => ({
      privilege: key,
      scope: "all",
    }));
  const grants = new Map<PrivilegeKey, PrivilegeGrant>();
  const legacy =
    user.userRole === UserRole.manager
      ? managerPrivileges
      : user.userRole === UserRole.employee
        ? employeePrivileges
        : [];
  for (const privilege of legacy)
    grants.set(privilege, { privilege, scope: "assigned" });
  for (const assignment of user.accessRoles ?? []) {
    for (const grant of assignment.role.grants) {
      const definition = privilegeDefinitions.find(
        ({ key }) => key === grant.privilege,
      );
      if (!definition || ("adminOnly" in definition && definition.adminOnly))
        continue;
      const privilege = definition.key;
      if (grants.get(privilege)?.scope !== "all")
        grants.set(privilege, { privilege, scope: grant.scope });
    }
  }
  return [...grants.values()];
}

export function hasPrivilege(
  user: AccessUser,
  privilege: PrivilegeKey,
): boolean {
  return effectivePrivileges(user).some(
    (grant) => grant.privilege === privilege,
  );
}

export function hasGlobalPrivilege(
  user: AccessUser,
  privilege: PrivilegeKey,
): boolean {
  return effectivePrivileges(user).some(
    (grant) => grant.privilege === privilege && grant.scope === "all",
  );
}
