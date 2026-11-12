# Companies and corporate deposits

Companies are independent customer organisations. They are not `ServiceType` records: services belong to the Ekvator catalogue, while companies pay for their employees' use of those services.

## Money model

All money is stored as integer kopecks (`amountMinor` / `balanceMinor`): `1_000_000` is 10,000 roubles. A company has an unallocated corporate balance; every active employee membership has a separate allocated deposit and a unique QR token.

`CompanyLedgerEntry` is append-only from the API perspective. Every allocation writes two entries sharing one `transferId`: a negative entry on the company balance and a positive entry on the employee balance. PostgreSQL checks prevent negative stored balances, and balance-changing operations hold a transaction-scoped advisory lock per company.

## API flow

1. An authenticated user calls `POST /companies` and becomes the company owner.
2. The owner calls `POST /companies/:id/employees` with an existing `userId`, or with `login`, `password`, and `name` to create and attach a driver.
3. The company calls `POST /companies/:id/top-ups`. It creates a `pending` request only.
4. Until a payment provider is integrated, an Ekvator administrator confirms an actual payment through `POST /admin/company-top-ups/:id/confirm`.
5. The owner transfers funds to a driver through `POST /companies/:id/employees/:memberId/allocations`.
6. A driver displays the token from `GET /companies/:id/employees/:memberId/qr`. An administrator or an appropriately assigned service manager calls `POST /admin/company-qr/charges`; the server obtains the current service price, checks access and the employee deposit, then performs an atomic debit.

The QR token is an account credential: clients must render it as a QR image locally and must not expose it in public listings. Actual payment-provider callbacks are intentionally not implemented yet; they should confirm the existing pending top-up rather than write balances directly.
