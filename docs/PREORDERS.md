# Cart and preorders

All cart and customer-order routes require a bearer token for an ordinary user or an administrator.

- `GET /cart`, `POST /cart/items`, `PATCH /cart/items/:id`, `DELETE /cart/items/:id`
- `POST /orders` creates an order from the current cart and clears that cart.
- `GET /orders/me` shows the customer's orders.
- A customer can accept/reject an administrator's schedule proposal, confirm completion, or postpone once.
- `GET /admin/orders` and calendar views are available to administrators, managers, and employees within their assigned services. Managers can reschedule and archive assigned orders; employees can update an assigned order's status. Administrators retain unrestricted access.

## Availability and booking modes

`ServiceType.acceptsPreorders` and `ServiceElement.preorderAvailable` must both be enabled before an item can be checked out. Existing catalogue data is deliberately disabled by default after the migration, so publishing a preorder is an explicit administrator action.

`allowMixedCart=false` makes a service exclusive: its items may only be ordered with items from that same service. Use it for unrelated flows such as hotel booking versus tyre services.

`bookingMode=appointment` accepts a single `desiredStartAt`. `bookingMode=duration` requires `desiredStartAt` and `desiredEndAt`, and may only be checked out as a separate service; this is the universal interval-booking mode for a hotel, bathhouse, parking space, or other long-running reservation.

## Lifecycle

New orders start as `pending`. An administrator may propose a different schedule, which changes the status to `needs_confirmation`; only the customer can accept that proposal, moving it to `accepted`. Operational statuses are `in_progress`, `ready`, and `completed`; cancellation/rejection are terminal. Completed, rejected, and cancelled orders may be archived.

The API stores immutable item names and prices on every order. Catalogue changes therefore never alter historical orders. The application checks due orders every minute and atomically completes accepted/in-progress/ready orders one hour after their scheduled end (or scheduled start for an appointment). A customer may postpone this deadline once, choosing the new final time.

Prepayment fields are part of the model but every created order has `paymentFeatureEnabled=false` and `paymentStatus=not_required`; no payment is collected or requested.
