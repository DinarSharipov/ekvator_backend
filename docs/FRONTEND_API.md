# Frontend API additions

Implemented locally on top of backend commit `6281806`. Deployment is not implied.

## Roles and privileges

See [roles and access](roles-and-access.md) for the full API and operation catalogue. Only members of the protected administrator role can create, edit, delete or assign roles through `/admin/roles` and `/admin/users/:id/roles`; `GET /admin/privileges` supplies the catalogue. Multiple roles combine permissions with `all` or `assigned` service scopes.

Read `privileges` from `/auth/me` or the login profile to gate staff navigation and actions. `userRole` and legacy `role` are removed. Roles expose `isAdministrator`; user writes accept administrator-controlled `roleIds`. See [frontend handoff](../FRONTEND_AGENT_REQUIREMENTS.md) for the breaking contract. Changes apply on the next request with the same JWT; refresh the profile after role/assignment changes. Deleting or demoting the last administrator returns `409`.

## Two kinds of service directions

### Bulk catalogue preorder availability

`PATCH /service-elements/preorder-availability` accepts JSON `{ "ids": [1, 2, 3], "preorderAvailable": true }` (or `false`) and returns `204` without a response body. Requires Bearer authentication and `items.update` covering every selected position's service. Send 1–1000 unique positive integer IDs; string IDs and string booleans are rejected with `400`. An unknown ID returns `404`, insufficient service access returns `403`; the whole batch is rejected without partial updates. Repeating a request is safe. Only `preorderAvailable` changes: archive status and the service's `acceptsPreorders` remain independent gates. No migration is required.

`ServiceType.kind` is `goods` or `services`. Read it from `/services`, `/services/:id`, order item service metadata, and calendar service filter options. Send it in multipart service creation/update alongside `bookingMode`.

| kind | bookingMode | Selection | Scheduling |
| --- | --- | --- | --- |
| goods | appointment | Each position has quantity 1–100 | Start time only |
| services | appointment | One of each selected position; multiple distinct positions allowed | Start time only |
| services | duration | One of each selected position; multiple distinct positions allowed | Start and end required |

`goods` plus `duration` returns 400. The existing `preorderAvailable`, `acceptsPreorders`, and `allowMixedCart` gates still apply. Duration bookings remain separate orders for a single direction. An accepted draft is revalidated at placement, including if a direction was reclassified after selection. Existing historical quantities and prices are unchanged.

Capacity still means concurrent **orders for the direction**, not the number of selected positions. Several service positions in one period order form one reservation. There are no individual room, parking-space, employee, or equipment identifiers, and appointment orders do not reserve interval capacity. Do not present this API as guaranteeing a particular physical resource.

Migration `20261120010000_service_kinds` labels existing period directions `services` and existing appointment directions `goods`, preserving the previous quantity and scheduling behavior. **Review those classifications in administration:** e.g. an appointment-based repair direction should be explicitly switched to `services`. Migration changes neither existing order snapshots nor draft quantities; drafts incompatible with a subsequent reclassification must be corrected before placement.

For old clients omitting `kind`, creation infers `services` when `bookingMode=duration`, otherwise `goods`. Updating to duration without `kind` also selects `services`; other updates preserve the current kind. New clients should send the explicit kind and mode together. Apply migration and application release together; a legacy binary does not know how to populate the new kind for newly created period directions.

## Multipart services

`POST /services` now accepts `bookingCapacity` as multipart decimal text and converts it to an integer before Prisma. The frontend's POST-then-PUT workaround is no longer needed once this backend is deployed. Capacity is 1–2147483647. Boolean parts accept `true`/`false` only. Missing names, blank names, malformed capacities, invalid kinds/modes/display modes, unknown fields and corrupt images return 400.

Only `name` is required. It is trimmed and limited to 200 characters; description is limited to 5000. `showType` is `table` or `blocks`. Omitted create flags use database defaults; omitted update flags preserve saved values. PUT continues to require a name. As before, supplied files replace images: no cover clears the cover; no gallery clears the gallery. Send the retained cover/gallery when saving a full form. The limit remains ten gallery images and 10 MiB per file.

## Administrative company lists

Bearer token with the corresponding privilege is required. Accounts without that privilege receive 403; anonymous requests receive 401.

- `GET /admin/companies?page=1&limit=20&query=...`
- `GET /admin/company-top-ups?page=1&limit=20&query=...&companyId=3&status=pending`

Both return `{ items, total, page, limit }`. Limit is 1–100; page is 1–1000000. `query` searches company name and INN case-insensitively. Companies sort by descending ID; top-ups sort by descending creation time, then ID. Top-up status is `pending`, `confirmed` or `cancelled`; omit it to include all statuses. Each top-up includes a compact `company: { id, name, inn }` for display. Company responses omit members' QR credentials.

These discovery endpoints require `companies.read` and `topups.read`, respectively (both included for administrators). Manual confirmation requires `topups.confirm`; listing a pending top-up does not credit it.

## Global contacts

- Public `GET /settings/contacts` returns the configured business contacts, or 404 before initial setup.
- `PUT /admin/settings/contacts` requires `settings.update` (included for administrators) and atomically replaces the settings with JSON:

```json
{
  "name": "Complex name",
  "address": "Business address",
  "phones": ["+79991234567"],
  "workingHours": "24/7",
  "latitude": 55.645194,
  "longitude": 52.839371,
  "email": null,
  "mapUrl": null
}
```

All fields except email/mapUrl are required. The response adds `updatedAt`. Phones must be 1–10 international numbers starting with `+`; email/mapUrl are optional and nullable. Omission on PUT clears those two fields. Coordinates are numeric, with latitude -90–90 and longitude -180–180. Map URLs accept HTTP/HTTPS. No unverified contacts are seeded; the frontend can retain its existing fallback until an administrator configures real details.

## Integration and verification

No sibling repository is changed. Frontend follow-up: regenerate OpenAPI types, add the kind selector, hide quantity controls for services and submit 1, restrict goods to start-time orders, remove the capacity workaround, connect corporate list screens and contact editing/reading.

Run `npm run test:frontend-contracts` or `npm run test:e2e` with `TEST_DATABASE_URL` pointing to a migrated local PostgreSQL database ending in `_test`. The checks exercise real Nest HTTP and PostgreSQL, multipart images, invalid input, both kinds, booking conflicts, role boundaries, pagination, contacts, and OpenAPI schemas. They do not prove browser interaction or production deployment.

SMS sending and payment-provider callbacks remain separate integrations requiring a selected provider and its configuration. This release does not turn on SMS verification or future online prepayments.

## Partners

- GET /partners: public array of partners, ordered by id ascending.
- GET /partners/:id: public partner details; 404 if absent.
- POST /partners: JWT and settings.update; returns 201 with the created partner.
- PATCH /partners/:id: JWT and settings.update; returns 200 with the updated partner.
- DELETE /partners/:id: JWT and settings.update; returns 204 without a body.

Required creation fields: name (nonblank, trimmed, up to 200 characters), image (base64, up to 90000 characters). ID is an automatically generated integer and cannot be supplied or edited.
Image accepts raw standard padded base64 or a data:image/png|jpeg|gif|webp;base64, prefix. It is stored and returned unchanged. The API validates base64 syntax, not the decoded image contents. Keep the entire JSON body below the server's default 100 KiB limit.
Optional nullable fields: site (absolute HTTP/HTTPS URL, up to 2000 characters), email (up to 254), phone (up to 50), person (contact name, up to 200), inn (10 or 12 digits).
All fields are returned, including optional fields as null when unset. These are public partner contact details; do not enter private contact information.
PATCH preserves omitted fields; null clears optional fields but is rejected for name/image. Unknown fields are rejected. Invalid input returns 400; protected writes return 401/403 without authentication/privilege; missing partner returns 404.

Example creation body:
~~~json
{"name":"Partner","image":"aGVsbG8=","site":"https://example.com","inn":"1650123456"}
~~~

The migration only creates the Partner table and its sequence; it does not change existing records or role grants.

## M-7 news

Public `GET /news/m7?category=all&period=7d`: category `all|traffic`, period `24h|7d|30d`; unknown values return 400. Response `{articles:[{url,title,seendate,domain,sourcecountry,language}],fetchedAt,stale}`. Visitors read a shared background cache only. Failures preserve the last successful response and timestamp with `stale:true`; no cache returns 503 (`M7_NEWS_UNAVAILABLE`). `seendate` is discovery time, never incident time. See [M7_NEWS.md](M7_NEWS.md) for cache lifecycle, filtering, diagnostics and outstanding real-data acceptance.
