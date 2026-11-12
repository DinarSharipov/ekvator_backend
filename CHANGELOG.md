# Changelog

## 2026-11-12

- Added repository engineering and commit hygiene guidelines in `AGENTS.md`.
- Added user registration and authentication by login or phone number, roles, and a disabled-by-default SMS verification feature flag. Existing accounts were migrated to administrators without modifying their credentials.
- Added carts and preorders: availability controls for services and catalogue items, order lifecycle and schedule confirmation, one-time postponement, archival, and a foundation for future prepayments.
- Added interval booking for long-running services with configurable capacity and transaction-safe protection against overlapping reservations.
- Added end-to-end PostgreSQL coverage for carts and preorders, including access control, booking conflicts, order lifecycle, price snapshots, and overdue completion. Empty carts now consistently return an empty item list.
