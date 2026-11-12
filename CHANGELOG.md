# Changelog

## 2026-11-12

- Added complete Swagger response contracts for site analytics and audited every published endpoint so each successful response with a body has an explicit OpenAPI schema. Expanded typed response documentation for authentication, user management, services, and catalogue items.
- Added privacy-conscious site activity analytics: idempotent visitor events, daily unique-visitor and interaction summaries, service attribution, and administrator-only reporting endpoints.
- Added frontend integration guidance for activity analytics, including stable anonymous visitor identifiers and semantic click targets without personal data in URLs.
- Completed OpenAPI response contracts for corporate accounts, carts, preorders, administrator calendar, and filter endpoints. Corporate responses now expose safe participant, top-up, QR, allocation, and ledger representations without leaking QR credentials in general company payloads.
- Added a public server-side Open-Meteo weather endpoint with UTC date validation, normalized forecast responses, timeout protection, and a short successful-response cache.
- Added extensible role-based access for administrators, managers, employees, and customers. Administrators can assign roles and multiple services; managers can manage employees and orders only within their assigned services.
- Added service-scoped access to order management, calendar events, filter options, and catalogue items, plus end-to-end coverage for cross-service isolation and privilege boundaries.
- Added repository engineering and commit hygiene guidelines in `AGENTS.md`.
- Added user registration and authentication by login or phone number, roles, and a disabled-by-default SMS verification feature flag. Existing accounts were migrated to administrators without modifying their credentials.
- Added carts and preorders: availability controls for services and catalogue items, order lifecycle and schedule confirmation, one-time postponement, archival, and a foundation for future prepayments.
- Added interval booking for long-running services with configurable capacity and transaction-safe protection against overlapping reservations.
- Added companies as customer organisations with owners, employee memberships, QR deposit credentials, pending/confirmed top-ups, atomic allocation, service-side QR charges, and an auditable ledger in kopecks.
- Added Swagger operation descriptions for carts, preorders, calendar operations, and the corporate API.
- Added an isolated PostgreSQL end-to-end scenario for company registration, top-up confirmation, deposit allocation, QR charging, and ledger integrity.
- Expanded company end-to-end coverage for access boundaries, validation, concurrent confirmation, catalogue availability, service-scoped manager access, and insufficient-balance handling; fixed module dependency wiring discovered by the full integration run.
- Added end-to-end PostgreSQL coverage for carts and preorders, including access control, booking conflicts, order lifecycle, price snapshots, and overdue completion. Empty carts now consistently return an empty item list.
- Added read-only administrator calendar endpoints with interval, service, catalogue item, customer, status, and archive filters, along with compact filter option endpoints for services and users.
