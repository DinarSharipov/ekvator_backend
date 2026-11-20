# Frontend integration requirements

## Unified roles — implemented locally, not deployed

The backend now has one role system. `UserRole`, `User.userRole` and `User.role` are removed by `20261120040000_unified_roles`. Existing staff access is migrated into regular editable roles and assignments. Names such as `manager`, `employee` or `admin` confer no privileges. The administrator is a protected role in the same catalogue.

### Published contract

- Authentication response and `GET /auth/me`: `accessRoles: [{ role: { id, name, isAdministrator, grants: [{ privilege, scope }] } }]`, effective `privileges`, and `serviceAssignments`. User read/create/update responses expose the same role structure; effective `privileges` are supplied in auth/profile responses.
- User create/update: replace `role` / `userRole` with optional `roleIds: number[]`. Only administrators may include that field. Omitted on update preserves roles, `[]` clears roles, `null` is invalid. Profile and assignments commit atomically.
- `PUT /admin/users/:id/roles`: the complete role set, including the protected administrator role. Reapplying the existing administrator assignment is allowed. Removing the last administrator returns `409`.
- Roles include read-only `isAdministrator`. Protected role update/delete returns `409`; its privileges cannot be edited. Do not submit this flag to role CRUD.
- Manager/employee roles are editable, renameable and removable after unassignment. Do not infer their identities from names or numeric IDs.
- Ordinary registered accounts have no roles or administrative grants. Delegated account creators cannot assign any role. Admin assignment is a separate admin-only action or part of an admin user write.
- Old role fields in requests return `400`; they are never silently interpreted. Existing login/register requests, catalogue, orders, bookings and corporate payloads otherwise remain unchanged. Company membership `role: owner/employee` is a separate business relationship and stays unchanged.

### Confirmed incompatible frontend paths

Read-only inspection of sibling `ekvator_frontend/src` found the following consumers:

- `services/types.ts`, `services/backend.generated.ts`, `services/authorizationService.ts`: old enum/profile/write fields and admin checks.
- `services/access.ts`: old admin/manager/employee checks and account edit gating.
- `forms/schemas.ts`, `components/admin/UserFormModal.tsx`: fixed-role select and validation; user submissions currently send both old fields.
- `components/admin/UsersTable.tsx`, `components/authorizationModal/AuthorizationModal.tsx`: old-role display labels.
- `components/admin/RolesSection.tsx`: protected-role rendering and full role assignment semantics need updating.

### Required behavior and acceptance checks

1. Regenerate API types from the new OpenAPI contract; display names from assigned roles and an ordinary-account label when none are assigned. Remove fixed-role selects and name-based permission branches.
2. Gate each action by its effective privilege and operation-specific scope. For role management, use membership with `role.isAdministrator`; token presence alone is insufficient. Refresh the profile after role/assignment changes and handle `401/403/409` from the server.
3. Administrators select actual role IDs from the catalogue. Other account editors omit `roleIds` entirely. Creating an account never grants employee permissions implicitly.
4. Disable protected-role editing/deletion in the UI; ordinary roles remain fully editable. Permit retaining the administrator role while editing that account. Show the `409` error if attempting to remove the last administrator.
5. Delegated account editing must reflect backend restrictions: cannot manage administrator/accounts with `users.*` or `roles.*`, or take over an account with stronger privilege/scope/service coverage. The backend remains authoritative.
6. Verify admin login, new user creation, custom role assignment/revocation with the same JWT, renamed manager/employee roles, scoped order operations, companies, and last-administrator protection through browser/API integration. Run the frontend repository's required checks.

The backend agent has changed only the backend repository, respecting the sibling repository boundary. No frontend compatibility or production deployment is claimed. The backend automatic deploy runner refuses the old schema before mutation: first cutover needs a coordinated frontend release and a recovery backend compatible with the new schema, plus a tested backup restore. See `docs/AUTH.md`.
