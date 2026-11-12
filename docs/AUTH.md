# User registration and authorization

## Roles and migration

`User.userRole` is the access role: `admin` or `user`. The database default is `user`.
The registration migration assigns `admin` to every existing account. The legacy
`role` field is preserved for compatibility and is not used for access decisions.
An administrator can create any role through `POST /users`; see [roles-and-access.md](./roles-and-access.md) for role and service-assignment rules.
its default access role is `admin`, with an optional explicit `userRole` override.
Only administrators can list, create, update or delete users and mutate services,
service elements or their order. Public catalogue reads remain public.

Apply the committed migration using `npx prisma migrate deploy` as part of the
normal release process. It preserves original phone values, adds a nullable unique `phoneNormalized` lookup
column and nullable `phoneVerifiedAt`, and makes login unique. Existing users receive
`admin` through a constant column default; no bulk role UPDATE is required. If existing logins or
normalized nonempty phone numbers are duplicated, it aborts atomically with an explicit
error. Resolve duplicates before retrying; do not delete accounts automatically.
After a failed Prisma migration, use the normal Prisma migration recovery workflow
before retrying the deployment. A database backup and a preflight duplicate check
should precede production application of this identity migration.

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
  including `userRole` and `phoneVerifiedAt`.
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

JWTs include `sub`, `login` and `userRole`. Authorization always reloads the account
from the database, so role changes and account deletion take effect for existing
tokens too. Old JWTs without `userRole` remain usable for migrated administrators. Ordinary-user
JWTs use a separate signing key derived from `JWT`, so the old application cannot
accept them as administrator sessions if its image is restored.
Passwords and hashes are excluded from user responses. New passwords use salted
scrypt hashes; existing plaintext passwords remain unchanged so rollback does not lock existing
administrators out. Migrating those legacy passwords to hashes is a separate release
after retiring the legacy application. New accounts and explicitly changed passwords
use scrypt. An explicit password change is not compatible with legacy plaintext login.
`PUT /users/:id` supports partial updates; omit `password` to keep it unchanged.
Changing a phone resets its confirmation state.

## SMS verification flag

Set `SMS_VERIFICATION_ENABLED=false` (the default) to allow registration and login
without SMS. Such accounts keep `phoneVerifiedAt=null`; bypassing verification
does not falsely mark their phone as verified.

`SmsVerificationService` is the boundary for a future SMS provider and confirmation
flow. No SMS is sent and no verification codes are generated or accepted yet.
Until that integration is implemented, setting the flag to `true` makes public
registration return `503` and blocks unverified ordinary accounts at login and on
protected routes with `403`. Existing administrators retain access. Do not enable
the flag in production until the real confirmation flow is connected.

## Frontend integration

The frontend should use `/auth/me` or the returned profile's `userRole` to choose
between ordinary user and administrator UI. The presence of a token alone no
longer grants administrative access. Existing login requests remain compatible.
User edit forms must no longer expect a password from user responses; omit the
password property unless the administrator is setting a new password.

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

The deployment first runs `scripts/auth-preflight.cjs` in read-only mode. It checks
login and normalized phone conflicts and failed Prisma migration history, exposing
only counts. A failed check stops before Prisma changes the migration history.
It then creates a private full `pg_dump -Fc` backup in the server's `backups/`
directory, checks its archive listing, and only then runs migrations. A failed dump
or archive check aborts deployment. Backups are not removed automatically.
Archive readability is not a substitute for a successful restore rehearsal.

The migration modifies only `User` and adds an enum and indexes; it does not touch
`ServiceType`, `ServiceElement`, photos, prices or galleries. All original user fields
are preserved byte for byte. `lock_timeout=5s` bounds waiting for table locks;
`statement_timeout=60s` bounds each statement. Any error rolls the migration back.
The old application continues running if preflight, backup or migration fails. A
failed migration still requires `prisma migrate resolve --rolled-back` after checking
that the transaction was rolled back; do not mark an unapplied migration applied.

Do not create or edit accounts through the old application while applying this
identity migration and switching images. Old code does not fill `phoneNormalized`
or `userRole`; the new application writes both explicitly. Existing admin login
and catalogue reads are compatible with the additive schema. After rollback to
old code, ordinary-user functionality is unavailable and newly created or explicitly
changed password hashes cannot be authenticated by that legacy version.

Before release, rehearse restoring a fresh backup to a separate PostgreSQL 16
database and run migration and integration checks there. Never use `migrate reset`,
`db push --accept-data-loss`, or automatic duplicate-account deletion on production.

### Verification on 12 November 2026

A fresh production backup was restored into a temporary, network-isolated
PostgreSQL 16.11 container on the same server. The migration completed successfully.
Before/after fingerprints matched for every original user field and every catalogue
record, including photos and galleries. Counts remained 4 users, 6 service types and
113 service elements; all 4 users received `admin`. The temporary container was
removed. The production schema and records were not migrated or modified.

Backup retained on the server (private, not downloaded):
`/home/backend_deploy/ekvator/backups/cart-before-migration-20261111T220448Z.dump`.

Local regression checks additionally replayed migration history with 5000 users and
10000 catalogue rows, checked duplicate and lock-timeout rollback, and ran both the
original HEAD application and the new application against the upgraded schema.
Existing administrator login remained compatible; ordinary-user tokens were rejected
by the original application.
