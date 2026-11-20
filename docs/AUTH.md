# User registration and authorization

## Unified roles

All permissions come from AccessRole assignments. There is no User.role, User.userRole or UserRole enum. See [roles-and-access.md](roles-and-access.md) for role management, scopes and administrator protection. Registration creates an ordinary account without roles. Only the protected administrator role can assign roles; delegated users.create/update cannot confer roles.

## HTTP contract

- `POST /auth/register`: `{ "login": "guest", "phone": "+79991234567", "password": "a-long-password", "name": "Guest" }`.
  `name` is optional and defaults to login. Login must start with a Latin letter
  and contain 3–64 Latin letters, digits, underscores, dots or hyphens. Password
  length is 8–128 characters. Returns `201` with `{ access_token, user }`.
- `POST /auth/login`: `{ "login": "guest", "password": "a-long-password" }`
  or `{ "phone": "+79991234567", "password": "a-long-password" }`.
  A phone number can also be supplied in `login` for a single identifier input.
  Supply exactly one of `login` and `phone`. Returns `200` with `{ access_token, user }`.
- `GET /auth/me`: Bearer JWT required. Returns the current user's safe profile,
  including `accessRoles`, effective `privileges`, service assignments and `phoneVerifiedAt`.
- `GET /auth/features`: public endpoint returning `{ smsVerificationEnabled: false }`.

Invalid input returns `400`; invalid credentials or JWT return `401`;
insufficient privileges return `403`; duplicate login or phone returns `409`.
Public registration rejects unknown properties, including role and verification
fields. Roles and verification state cannot be supplied through registration.

Russian local numbers starting with `8`, ten-digit Russian numbers and formatted
numbers normalize to an international `+` representation. Other international
numbers use 11–15 digits with a nonzero country prefix. Login matching is
case-sensitive. Normalized valid phone numbers and logins are unique, with database constraints
also covering simultaneous registration attempts.

New JWTs contain only `sub` and `login` plus standard expiry claims. Every authenticated request reloads current roles and grants from the database. Existing JWTs signed with either supported key remain usable; role claims in them are ignored. All newly issued JWTs use the derived signing key.
Passwords and hashes are excluded from user responses. Existing stored passwords remain unchanged; verification still accepts legacy plaintext credentials. New accounts and explicitly changed passwords use salted scrypt hashes. Preserving credentials does not make an old application image compatible with the unified schema.
`PUT /users/:id` supports partial updates; omit `password` to keep it unchanged.
Changing a phone resets its confirmation state.

## SMS verification flag

Set `SMS_VERIFICATION_ENABLED=false` (the default) to allow registration and login
without SMS. Such accounts keep `phoneVerifiedAt=null`; bypassing verification
does not falsely mark their phone as verified.

`SmsVerificationService` is the boundary for a future SMS provider and confirmation
flow. No SMS is sent and no verification codes are generated or accepted yet.
Until that integration is implemented, setting the flag to `true` makes public
registration return `503` and blocks unverified accounts without effective staff privileges at login and on
protected routes with `403`. Accounts with effective staff privileges retain access; role labels have no bearing on verification. Do not enable
the flag in production until the real confirmation flow is connected.

## Frontend integration

Use effective `privileges` and service assignments for individual actions. Read `accessRoles[].role.isAdministrator` for protected role management; display assigned role names directly. Send `roleIds` for administrator-controlled assignments, never `role` or `userRole`. Authentication requests and existing order/company/catalogue payloads remain unchanged. See [frontend handoff](../FRONTEND_AGENT_REQUIREMENTS.md).

## Verification

`npm run build` compiles the application. `npx prisma validate` checks the schema.
For HTTP integration checks, provision a disposable local database with a name
ending in `_test`, apply migrations to it, and run:

```sh
TEST_DATABASE_URL=postgresql://test_user:password@127.0.0.1:5432/ekvator_auth_test npm run test:auth
```

The test refuses remote databases or names without the `_test` suffix, uses the
real Nest application and Prisma client, and cleans up its own test accounts.
It covers validation, registration, concurrent duplicates, login, legacy-password preservation, role enforcement, profile safety, legacy JWTs and the SMS flag.

## Production deployment safety

The role-unification migration removes legacy columns. It preserves account identifiers, profiles, password hashes, phones, service assignments, existing custom roles and business records; it transfers old role access into actual grants and assignments. It is transactional, with lock_timeout=5s and statement_timeout=60s. Local migration tests verify existing data and effective privileges, including a late failure and complete rollback.

The previous application image requires removed columns and is **not a valid rollback image** after this migration. Legacy frontend builds send old role fields and require their own coordinated release. Do not apply this schema change as an ordinary image-only rolling update.

The first production cutover completed on 2026-11-20 at 18:21 Moscow time from `e69c311`. The user authorized backend-only deployment; the frontend agent's adapted source passed API-type compatibility checks, and frontend publication remains separate. The live migration preserved original records in 19 tables and all effective account privileges. A private restored production copy passed migration, normal startup and direct `node main.js` recovery startup before the live stopped-writer backup and migration. The pinned recovery image uses the new schema; the legacy image must never be started against it. Private backup and startup files are retained under `/home/backend_deploy/ekvator/backups/unified-release-20261120T151958Z-e69c311019a350e041ddfe0aaca2cd2779e6300e/`.

The automatic scripts/safe-deploy.sh runner invokes auth-preflight.cjs --require-unified-roles and refuses a database with either legacy role column before stopping the app or applying migrations. That guard deliberately cannot be bypassed by an environment flag. It prevents an unsafe automatic cutover while clients and recovery are not ready. Future releases on an already unified schema retain backup restore rehearsal, all-column row digests, final maintenance backup, health checks and authenticated smoke checks.

A coordinated first cutover requires a frontend using the new contract, a recovery backend built for the new schema, and a fresh private pg_dump -Fc backup with a tested restore on isolated PostgreSQL 16. Stop writers for the final backup and migration; compare unchanged business fields, preexisting role rows and assignments, plus every user's effective access. Retain the exact old role mapping in the private backup. Start only schema-compatible candidate/recovery images. If a failure occurs after live writes resume, preserve those writes and fix forward or use the compatible recovery image; never automatically restore an older database backup.

The existing all-column data-integrity verifier intentionally cannot certify a column-removing transition. Do not weaken it by globally skipping missing columns. For this one-time transition, `scripts/unified-role-integrity.cjs snapshot` records private digests before migration and `verify` reads that snapshot from stdin after migration. It compares every original business column, existing custom roles/grants/assignments and every account's effective privileges and administrator status. Its only expected transformations are removed legacy user columns, three added roles with grants/assignments, the administrator flag, and the updated `roles.assign` description. Run the normal invariants check as well. Regression tests verify both preservation and rejection of changed credentials or privileges; repeat these checks on the restored production copy and within the stopped-writer production window.

Do not use migrate reset, db push --accept-data-loss, automatic account deletion, or backup restoration over newer live data. Production configuration and volumes must remain untouched. A failed transactional migration still needs normal Prisma recovery after verifying rollback; do not mark an unapplied migration applied.
