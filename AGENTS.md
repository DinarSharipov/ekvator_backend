# Repository Guidelines

## Scope

These instructions apply only to this repository and all files within it. They do not apply to sibling repositories or any files outside this repository.

## Engineering Standards

- Follow current best practices for building modern applications with NestJS 11, Prisma 7, and PostgreSQL 16.
- Write readable, maintainable code that is easy to extend. Use clear names, focused modules, and small functions with well-defined responsibilities.
- Follow NestJS conventions for modules, controllers, services, dependency injection, validation, and error handling. Keep controllers focused on HTTP concerns and business logic in services.
- Use Prisma's type-safe APIs and appropriate PostgreSQL constraints and transactions to preserve data integrity. Manage schema changes through Prisma migrations.
- Avoid large blocks of duplicated or nearly identical code. Extract shared behavior into reusable functions, services, or modules when it represents a common responsibility.
- Prefer simple, explicit solutions. Keep abstractions proportional to actual requirements and consistent with the existing project structure.

## Commit and Push Hygiene

- Before every commit and every push, delete temporary snapshots generated during agent work, including browser snapshots and screenshots in `.playwright-mcp/`. Do not include these artifacts in commits.
- This cleanup applies only to temporary artifacts within this repository. Preserve intentional test fixtures and reference assets.
- Before every commit, update `CHANGELOG.md` with a concise, user-facing summary of the change.
