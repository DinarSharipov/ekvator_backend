# Site activity analytics

The backend receives a deliberately small, first-party event stream. It does not collect IP addresses, user-agent strings, query parameters, form contents, phone numbers, or button labels.

## Frontend integration

Generate one UUID once in the browser and retain it in `localStorage` (for example, under `ekvator.analyticsVisitorId`). Send events in batches to `POST /analytics/events`. Each event needs a new UUID `eventId`; retrying a batch is safe because `eventId` is idempotent.

```ts
await fetch(`${API_URL}/analytics/events`, {
  method: "POST",
  headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify({
    visitorId,
    events: [{
      eventId: crypto.randomUUID(),
      type: "click",
      path: window.location.pathname,
      target: "cart.checkout",
      occurredAt: new Date().toISOString(),
    }],
  }),
});
```

Record `page_view` on route changes and `click` only for meaningful product actions. Use stable technical target keys such as `service.open`, `cart.add`, `cart.checkout`, `auth.login`, and `order.confirm`; never use rendered text or user input. Add `serviceTypeId` where the action belongs to a service.

Authenticated requests are associated with the current account on the server. Anonymous visitors remain anonymous. A person using multiple browsers is counted as multiple browser visitors, while `authenticatedUsers` is counted separately.

## Admin reporting

`GET /admin/analytics/overview?from=<ISO>&to=<ISO>` is administrator-only. The range is half-open UTC `[from, to)`, maximum 93 days; without dates it returns the current UTC day. It contains totals, daily series, top clicked services, and top click target keys.
