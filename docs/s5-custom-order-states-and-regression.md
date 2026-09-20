# S5 — Custom Order States & Regression Guide

This document records the custom-order lifecycle delivered by S1 (state
machine + API), S2 (storefront request/tracking UI) and S3 (TalkJS chat), and
lists the regression coverage that proves the flow is still coherent end to
end. It is the acceptance reference for the S5 milestone:

> A custom order can be driven end to end (request → quote → confirmed →
> produced → delivered) with in-platform chat, and nothing in the regression
> suite shows the flow has drifted.

Source of truth in code:

- State machine and business rules:
  `fyp-backend/src/modules/custom-order/state-machine.ts`
- Persistence and status history:
  `fyp-backend/src/modules/custom-order/service.ts`
- Storefront status/timeline mapping:
  `fyp-storefront/src/lib/util/custom-order-status.ts`

---

## 1. Order statuses

| Status | Meaning | Set by |
| --- | --- | --- |
| `request` | The buyer has submitted the requirement and is waiting for the artisan to review it. Every order is created in this state. | System (on creation) |
| `quote` | The artisan has reviewed the request and provided a quote (`quoted_amount` in minor units). | Artisan / admin |
| `confirmed` | Buyer and artisan have agreed on the quote; the order is locked in. The quote can no longer change. | Artisan / admin |
| `produced` | Payment has been authorized or captured and the product has been made. | Artisan / admin |
| `delivered` | The product has been handed to the buyer. `delivered_at` is recorded. Terminal state. | Artisan / admin |
| `cancelled` | The order was abandoned. `cancelled_at`, `cancelled_by` and `cancellation_reason` are recorded. Terminal state. | Customer, artisan or admin (before production) |

`cancelled` is not part of the five-step happy path, but it is fully
implemented in the backend state machine (`CUSTOM_ORDER_STATUSES` in
`state-machine.ts`), so it is documented here as a first-class status.

## 2. Legal transitions

```
request ──► quote ──► confirmed ──► produced ──► delivered
   │           │           │
   └───────────┴───────────┴──────────► cancelled
```

Defined in `CUSTOM_ORDER_TRANSITIONS`:

| From | Allowed next statuses |
| --- | --- |
| `request` | `quote`, `cancelled` |
| `quote` | `confirmed`, `cancelled` |
| `confirmed` | `produced`, `cancelled` |
| `produced` | `delivered` |
| `delivered` | — (terminal) |
| `cancelled` | — (terminal) |

Everything else is forbidden. Notable forbidden jumps, each covered by
regression tests:

- Skipping stages: `request → produced`, `request → delivered`, `quote → produced`, `quote → delivered`
- Reverse transitions: `delivered → confirmed`, `confirmed → quote`, `quote → request`
- Cancelling after production: `produced → cancelled` (once production has
  started the order can only be delivered)
- Reopening terminal states: `delivered → quote`, `cancelled → quote`
- Re-setting the current status is a no-op (`assertCustomOrderTransition`
  allows `x → x` so repeated PATCHes with an unchanged status do not fail).

## 3. Business conditions per transition

Enforced by `assertCustomOrderBusinessRules` (all mutations go through
`CustomOrderService.updateCustomOrderAtomically` in one DB transaction with
optimistic-concurrency `version` check):

- **Into `quote`**: a positive `quoted_amount` must be supplied in integer
  minor units (`0 < quoted_amount ≤ 2 147 483 647`). A zero, negative,
  fractional or missing quote is rejected.
- **Into `confirmed`**: a valid quote must already exist on the order; the
  quote becomes immutable from this point (`The quote cannot be changed after
  confirmation`).
- **Into `produced`**: `payment_status` must be `authorized` or `captured`.
  `pending` or `failed` payments cannot start production.
- **Into `delivered`**: only reachable from `produced`. The service stamps
  `delivered_at` with the transition time and appends a status-history row.
- **Into `cancelled`**: a non-empty `cancellation_reason` is required. The
  service stamps `cancelled_at`, `cancelled_by` and trims the reason, and
  appends a status-history row carrying that reason.
- **Terminal immutability**: `delivered` and `cancelled` orders cannot change
  quote, category, product references, listing type or payment status.
- **Payment sub-state machine**: `pending → authorized | captured | failed`,
  `authorized → captured | failed`, `captured` is final, `failed` may be
  retried. Only a platform administrator may change payment status.

## 4. Role permissions

| Role | Allowed | Not allowed |
| --- | --- | --- |
| Customer (buyer) | Create orders (`POST /store/custom-orders`), list/read own orders, update own order's `metadata` only, initiate chat on own orders | Change `status`, `quoted_amount`, category, product references, `payment_status` or `cancellation_reason` (rejected as `not_allowed`, HTTP 400); read or modify other customers' orders (HTTP 403); delete orders |
| Artisan (seller) | Read/update orders assigned to their store or explicitly linked via `artisan_user_id`; quote, confirm, mark produced/delivered, cancel with reason; open the order's TalkJS conversation | Access orders of other stores; change `payment_status`; delete orders |
| Platform admin | Everything: full status control, payment status, delete, list across all stores | — |
| Unauthenticated / other customers | — | Any custom-order endpoint (401 without login, 403 for someone else's order) |

Enforcement layers:

1. Medusa `authenticate` middleware (`src/api/middlewares.ts`) rejects
   unauthenticated requests on `/store/custom-orders*` (401).
2. `requireCustomerContext` ensures the storefront actor is a customer.
3. `assertCustomOrderAccess` matches customers by `customer_id` and
   backoffice users by store ownership (`user_store` link) or explicit
   `artisan_user_id` assignment; a lookup failure fails closed.
4. Service-level guard: a customer actor attempting any restricted change
   inside `updateCustomOrderAtomically` is rejected even if a route-level
   guard is ever bypassed.
5. Store isolation for the admin list endpoint: sellers are scoped to the
   artisan profiles of their own stores (`getAccessibleArtisanIds`).

## 5. Money format (minor units)

All API amounts are integers in the smallest currency unit. A budget or quote
displayed as `125.50 USD` is `12550` in the API payload. The storefront form
converts display input to minor units (`buildCustomOrderPayload` in
`fyp-storefront/src/lib/util/custom-order-request.ts`), and the detail page
divides by 100 for display. The backend rejects non-integer and negative
amounts and anything above `2 147 483 647` (`MAX_CUSTOM_ORDER_AMOUNT`).

## 6. Storefront timeline ↔ backend statuses

`getCustomOrderTimeline` (`custom-order-status.ts`) maps the backend status to
a five-step progress bar:

| Backend status | Timeline rendering |
| --- | --- |
| `request` | Request = current, rest upcoming |
| `quote` | Request complete, Quote current |
| `confirmed` | Request/Quote complete, Confirmed current |
| `produced` | First three complete, Produced current, Delivered upcoming |
| `delivered` | All five complete |
| `cancelled` | Single "Cancelled" step (terminal, off the happy path) |

The status names in the frontend type are the exact strings sent by the
backend; a contract test (`test:custom-order`) asserts the two lists stay in
sync so a backend rename cannot silently break the timeline.

## 7. TalkJS chat ↔ custom order relationship

- One private TalkJS conversation per custom order. The conversation ID is an
  HMAC of the order ID (`custom_order_<32 hex chars>`), not the public order
  ID, and both participants are set server-side (`participants: [buyer,
  artisan]`).
- Identities: buyer is `customer_<customer_id>` with
  `custom.platform_role = "buyer"`; the artisan is
  `artisan_<artisan_profile_id>` with `custom.platform_role = "artisan"`.
- The backend issues a user-scoped JWT only after the Medusa authorization
  checks pass (`GET /store/custom-orders/:id/talkjs` for buyers,
  `/admin/custom-orders/:id/talkjs` for merchants/admins). A user who cannot
  read the order can never obtain the conversation token — the endpoint fails
  with 401/403 before TalkJS is contacted.
- TalkJS tokens carry `iss = TALKJS_APP_ID`, `sub = <talkjs user id>` and
  `tokenType: "user"`; backend REST calls use short-lived `tokenType: "admin"`.
- Legacy local messages (`custom_order_message` table) are imported into the
  TalkJS conversation exactly once — only when the conversation does not yet
  exist on TalkJS (404 on the GET check). Existing conversations are never
  re-imported.
- Messages persist in TalkJS; the local table remains as a migration source.

## 8. End-to-end acceptance flow

Prerequisites: backend running (`pnpm dev` in `fyp-backend/`) with approved
artisan profile, storefront running (`pnpm dev` in `fyp-storefront/`),
`TALKJS_APP_ID` / `TALKJS_SECRET_KEY` configured, buyer and merchant accounts.

1. **Create** — Buyer signs in, opens *Custom orders → New request*, fills
   title/category/description/budget (e.g. `68.50`), submits.
   Expected: order appears with status **Request**, budget `68.50` shown;
   `POST /store/custom-orders` returned 201 with `status: "request"`.
2. **Quote** — Merchant signs into the admin, opens the order, sets
   `quoted_amount` (e.g. `72000` = 720.00) and moves to **Quote**.
   Expected: 200, buyer's detail page shows Quote as current step and the
   artisan quote amount.
3. **Confirm** — Merchant moves to **Confirmed**. Expected: quote becomes
   immutable; a customer PATCH touching `status`/`quoted_amount` is rejected
   with `not_allowed` (HTTP 400).
4. **Pay + produce** — Platform admin sets `payment_status: "authorized"`,
   merchant moves to **Produced**. Expected: 200; without payment the move is
   rejected with `Payment must be authorized or captured before production`.
5. **Deliver** — Merchant moves to **Delivered**. Expected: buyer sees all
   timeline steps complete and `delivered_at` recorded; further quote/category
   changes fail.
6. **Chat** — At any point after creation, buyer opens the order detail page:
   the chat panel loads (TalkJS session issued for their own identity).
   Merchant opens the same order in admin: same conversation, artisan
   identity. Messages appear for both parties and persist in TalkJS.
   Unauthenticated visitors get 401; another customer gets 403 and never
   receives a session.
7. **Cancellation branch** — While in `request`/`quote`/`confirmed`, an actor
   with access cancels with a reason. Expected: timeline shows Cancelled,
   reason displayed, order cannot be moved to `quote`/`confirmed` afterwards.
8. **Regression** — Ordinary products, cart and standard orders still work
   (covered by the existing core suite plus the S5 checks below).

---

## 9. Regression coverage added for S5

Backend unit tests (`pnpm test:unit`):

- `src/modules/custom-order/__tests__/s5-journey.unit.spec.ts` — full legal
  journey through the business rules; illegal jumps (`cancelled → quote`,
  `produced → cancelled`, …); terminal immutability; payment sub-state rules.
- `src/api/store/custom-orders/__tests__/s5-customer-guard.unit.spec.ts` —
  customer cannot change status/quote via `PATCH`; metadata-only updates pass;
  a non-owner customer cannot obtain a TalkJS session.
- `src/api/admin/custom-orders/[id]/__tests__/s5-store-isolation.unit.spec.ts`
  — a seller of another store cannot read a TalkJS session for the order; an
  explicitly assigned artisan and a platform admin can.
- `src/api/utils/__tests__/talkjs.unit.spec.ts` — extended with: missing env
  vars, TalkJS REST failure, network failure, conversation-ID determinism and
  per-order uniqueness, participant list.

Backend integration tests (`pnpm test:integration:http`, requires a reachable
database): `integration-tests/http/s5-custom-order-regression.spec.ts` drives
illegal status jumps, the quote-freeze rule, the payment gate, the
cancellation branch and the customer/stranger permission matrix over real
HTTP.

Storefront (`pnpm test:custom-order`): contract checks that the frontend
status set and timeline labels match `CUSTOM_ORDER_STATUSES` in the backend,
and that the request-form payload fields still match the backend POST route.

Known behaviour changes (S5 risk fixes):

1. The storefront order detail page no longer blocks on TalkJS — if the chat
   session cannot be prepared, order details and timeline still render and
   the messages section shows "Chat is temporarily unavailable".
2. The storefront `PATCH /store/custom-orders/:id` guard now also rejects
   `payment_status` and `cancellation_reason` from customers as `not_allowed`
   (HTTP 400), matching the service-level rule; previously those fields were
   silently ignored instead of rejected.

Running the integration suite: `medusa-test-utils` connects with the
`DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` environment variables
(they are not read from `DATABASE_URL`), creates and migrates a disposable
`medusa-*-integration-*` database and drops it afterwards. Derive them from
`DATABASE_URL` in the shell before `pnpm test:integration:http` on
cloud-hosted databases; never commit the credentials.
