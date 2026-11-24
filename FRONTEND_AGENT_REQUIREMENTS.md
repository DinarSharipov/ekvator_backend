# Frontend integration requirements

## Production backend ready — 2026-11-20, 18:21 Moscow

Unified roles are now live from backend commit `e69c311019a350e041ddfe0aaca2cd2779e6300e`. Migration `20261120040000_unified_roles` completed after a private restore/migration rehearsal and final stopped-writer backup. Original records in 19 tables, account privileges, administrator membership and database protection checks passed, followed by authenticated HTTP smoke checks.

The user explicitly requested backend deployment only; frontend publication remains with its own agent. Read-only inspection confirms the sibling source now uses `roleIds`, assigned grants and `isAdministrator`; `npm run check:api-types` passed without changing files. Its `scripts/check-deployment-contract.mjs` may now run against the live backend before frontend publication. This does not claim browser verification or deployment of the frontend. The original handoff below records the pre-cutover findings and is superseded by this status where it describes local-only backend work or obsolete frontend consumers.

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


## M-7 public news feed — frontend request, 2026-11-24


Frontend implemented locally on 2026-11-24; not deployed. Backend endpoint is not yet confirmed or implemented. Do not treat fixture verification as a working GDELT integration.

## Public endpoint

`GET /news/m7?category=traffic|all&period=24h|7d|30d` (defaults: all, 7d). No credentials. Reject unknown values with 400. Return JSON:

```json
{
  "articles": [{"url":"https://publisher.example/article", "title":"Original headline", "seendate":"20261124T100000Z", "domain":"publisher.example", "sourcecountry":"Russia", "language":"Russian"}],
  "fetchedAt":"2026-11-24T10:05:00.000Z",
  "stale":false
}
```

Articles preserve GDELT fields; seendate is discovery time, never confirmed event/publication time. Max 50, newest first; empty articles is a successful result, not an upstream outage. Missing/invalid records may be dropped. No invented descriptions. Images deliberately omitted: socialimage does not establish reuse permission. Optional images need an explicit approved-rights contract before rendering.

## Upstream and relevance

Use URLSearchParams with endpoint https://api.gdeltproject.org/api/v2/doc/doc, mode=artlist, format=json, sort=datedesc, maxrecords=50, timespan=period.

Candidate all query (not relevance-validated due upstream failures):

`("трасса М-7" OR "трасса М7" OR "трасса М 7" OR "M-7 highway" OR "M7 highway" OR "Volga highway") sourcelang:russian`

Candidate traffic query adds:

`(accident OR crash OR closure OR restriction OR repair OR congestion OR snow OR ДТП OR перекрытие OR ремонт OR пробка)`

GDELT searches machine-translated text; validate and refine the candidates against actual results, especially Cyrillic phrase coverage. Do not use bare quoted М7: short-phrase requests can return HTTP 200 with a text error. Frontend exports gdeltUrl for reproducible probes but never calls it for visitors.

Require route designation plus road context and evidence of Russian geography/source, never M7 substring alone. Remove tracking parameters/fragments, deduplicate canonical URLs and normalized equivalent headlines. Exclude foreign M7 roads and vehicle/model names. Frontend applies a conservative additional title filter; coverage may be incomplete and must be measured with real upstream data before release.

## Cache and failure contract

Shared cache per category+period, freshness 15 minutes, bounded upstream concurrency, globally spaced upstream requests at least 5 seconds apart (prefer more conservative scheduling), coalesce identical inflight requests. Serve stale successful cached data during upstream failures with stale=true and ORIGINAL fetchedAt. Bound retention and use conditional/background refresh as appropriate. Never cache an HTML/text error or overwrite successful cache with upstream failure.

Return 429 plus CORS-exposed Retry-After (seconds or HTTP date), 503 for unavailable upstream with no cache, 502 for malformed upstream. Rate-limit public manual refresh. Avoid user-controlled upstream URLs/queries and SSRF. No access tokens or upstream secrets should be required by frontend. Regular backend CORS configuration must cover the public frontend origin.

## Evidence from 2026-11-24

Real server-side GDELT probes returned HTTP 429 with body requesting one request per five seconds and no Access-Control-Allow-Origin. Browser fetch from localhost:5174 failed CORS (missing ACAO). An initial short-phrase probe returned HTTP 200 text: The specified phrase is too short. The refined all/7d candidate subsequently returned HTTP 200 with ACAO=* and an empty JSON object {}: zero real articles. Normalize this documented observed empty form to articles=[]; do not interpret HTTP-200 text errors as empty success. English-only all/30d and combined traffic/7d browser probes also failed fetch. Production GET /news/m7 currently returns 404 and is absent from OpenAPI. Relevance and full integration remain unverified.

## Acceptance

Publish OpenAPI for this endpoint, test valid/invalid enum values, deduplication/relevance with real results, all six category+period combinations, empty data, malformed HTTP-200 text responses, timeout, 429/Retry-After, stale cache retention and concurrent visitor requests. Then run frontend against deployed endpoint and compare displayed sources/discovery times with upstream, including actual publication count. No claim of real-data completion before this verification.
