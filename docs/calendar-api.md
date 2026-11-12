# Calendar API

All calendar routes require an administrator Bearer token. They are read-only and do not alter orders, users, or the catalogue.

## `GET /admin/calendar/events`

Returns scheduled order events that overlap the required half-open interval `[from, to)`. `from` and `to` are ISO 8601 date-times.

```text
/admin/calendar/events?from=2026-11-01T00:00:00.000Z&to=2026-12-01T00:00:00.000Z&serviceTypeIds=2,5&userIds=17&statuses=accepted,in_progress
```

Optional filters can be comma-separated or repeated: `serviceTypeIds`, `serviceElementIds`, `userIds`, and `statuses`. `includeArchived=true` includes archived orders. Without `statuses`, only active lifecycle states are returned: `pending`, `needs_confirmation`, `accepted`, `in_progress`, and `ready`.

Every event contains the order ID, ISO `startAt`/`endAt`, `timeSource` (`scheduled` or a pending customer-confirmation `proposed` time), status, customer details, item snapshots, current service metadata, notes, audit dates, and the calculated total. This avoids follow-up requests when opening an event in the calendar.

## Filter options

- `GET /admin/calendar/filter-options` returns services, catalogue positions, and the complete list of order statuses.
- `GET /admin/users/filter-options?query=...` returns user options for client filters. The optional case-insensitive query searches name, surname, login, phone, email, and Telegram handle. Each option includes a ready-to-display `label` plus all administrator-visible contact and role fields.

The service-position response uses `type` as the parent service ID. Use it to narrow the position filter after a service is selected.
