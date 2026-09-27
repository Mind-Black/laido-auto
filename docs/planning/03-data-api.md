# Data model, authorization, and API

This is a schema and API contract, not executable SQL. All times below are UTC instants unless explicitly described as local dates.

## Records

| Record | Main fields and invariants |
| --- | --- |
| `buildings` | ID, name, required IANA timezone; one row in v1 |
| `booking_policies` | Building, version, effective date, weekday window, daily/week limits, grace, minimum duration, horizon; initially 08:00–17:00 Mon–Fri, 240/720 minutes, grace 15 |
| `chargers` | ID, building, display name, enabled flag; initial two rows |
| `memberships` | Building, auth user ID, role (`member`/`admin`), active flag; unique building/user |
| `member_invitations` | Private normalized verified-email allowlist, building, intended role, claimed user ID; admin-only |
| `reservations` | ID, building, charger, user, start, scheduled end, effective end, deadline, status, check-in/release timestamps, version, policy version |
| `resource_allocations` | Charger, reservation or maintenance reference, nonempty `[start,end)` range; exactly one reference |
| `maintenance_blocks` | ID, charger, interval, reason, creating administrator |
| `audit_events` | Actor or system, operation, record, before/after, reason, server timestamp, request ID |
| `idempotency_requests` | User, operation, client key, canonical request hash, result reference; unique scope/key |
| `notification_outbox` | Unique event key, reservation version, type, due time, attempts, lease, state, last error |
| `job_health` | Job identifier, last successful run, outcome, processing delay |

The allocation table supplies one GiST exclusion constraint over charger equality and overlapping timestamp ranges, using `btree_gist`. It covers reservations and maintenance in the same invariant. Keep allocations and reservation effective intervals consistent inside trusted transactions. On early release, truncate the allocation to the logical release time; on a cancellation before start, remove its allocation while preserving the reservation and audit. Historical allocations remain harmless because new bookings cannot start in the past.

Use foreign keys and checks to require the same building for charger, reservation, membership, and allocation. Index reservation user/time for allowances, reserved deadlines for expiry, allocations by range, and due outbox events. Use a version number for optimistic edit checks.

## Effective time and allowance history

`scheduled_end` records the intended end. `effective_end` records the last retained reserved instant after cancellation or no-show. A future cancellation has no consumed interval; a no-show retains `[start, min(deadline, scheduled_end))`. Completed reservations retain the full scheduled interval. Scheduled future reservations consume their entire held interval immediately for quota validation.

For a reserved row whose deadline has elapsed, derive its effective end from the deadline even if its persisted status has not caught up. Read APIs must never overstate its future occupancy or future quota usage.

Persist UTC timestamps, but split usage at local midnight, week boundaries, and the weekday window using the building timezone. Return per-day and per-week usage; no client-supplied time, quota, owner, or role is authoritative. Policy/timezone changes require a separate audited migration and future-booking impact review in v1; do not retroactively reinterpret history from an unrestricted admin settings form.

## Transaction strategy

With one building and two chargers, serialize scheduling mutations by locking the building row. This single narrow mutex also covers quota changes across both chargers and avoids a complicated user/charger lock order. If future scale demands it, finer-grained locking is an explicit redesign.

Every booking create/update/cancel/check-in, maintenance change, membership change affecting access, and expiry batch follows the same order:

1. Authenticate and identify the building. Acquire its row lock; recheck membership/role after the lock.
2. Read `clock_timestamp()` once after acquiring the lock. Use that captured instant for this operation; transaction-start time may be stale after waiting.
3. Check idempotency. Same key and same request returns the original result; same key with different input returns a conflict.
4. Reconcile overdue reserved rows and ended checked-in rows, using logical deadlines rather than processing time.
5. Check record ownership/version, charger status, allowed interval, maintenance, same-user overlap, and affected daily/weekly allowances.
6. Write reservation/allocation changes, audit events, and outbox events in the same transaction.
7. Return canonical data and server time. The exclusion constraint is the final conflict backstop.

For domain validation failures after reconciliation, return a structured error result so due expiry changes can commit. Wrap the proposed mutation in a subtransaction if constraint handling requires it. Avoid raising an exception that unintentionally rolls back necessary reconciliation without a retry path. Unauthorized callers do not gain access to reconciliation or data.

Do not call email providers, HTTP services, or other slow systems while holding the building lock. Use bounded statement/lock timeouts and a retryable busy response. Expected requests are tiny at this scale.

## Proposed RPC contract

All RPCs require a Supabase user session except restricted system jobs. Generate TypeScript database types from migrations and wrap responses in `lib/api`.

| RPC | Input | Result |
| --- | --- | --- |
| `claim_membership` | No user-supplied identity | Bind an outstanding invitation to the caller's provider-verified email from trusted Auth data |
| `get_calendar` | Building, UTC range, optional charger | Redacted blocks, own booking details, server time, next transition, policy version; cap range to 31 days |
| `get_my_allowances` | Building, local date/week range | Used and remaining amounts for each bucket |
| `preview_reservation` | Charger, proposed interval, optional own booking ID | Proposed counted time and validation feedback; never a hold |
| `create_reservation` | Charger, interval, idempotency key | Committed reservation and resulting allowances |
| `book_now` | Charger, proposed end, explicit charging confirmation, idempotency key | Server-started, already checked-in reservation |
| `update_reservation` | Own ID, expected version, charger/interval, idempotency key | Atomic replacement; preserve old booking on failure |
| `cancel_reservation` | Own ID, expected version, idempotency key | Release future time; retain historical consumption |
| `check_in` | Own ID, idempotency key | Checked-in state or precise deadline failure |
| `finish_early` | Own checked-in ID, idempotency key | End at captured server time and release remainder |
| `admin_*` | Explicit member/block/booking action and reason | Audited action; quota override must be explicit if later supported |
| `process_due_reservations` | Restricted job context | Expiry/completion count and job health; not callable by members |

Return stable error codes: `NOT_AUTHENTICATED`, `NOT_A_MEMBER`, `FORBIDDEN`, `CHARGER_UNAVAILABLE`, `INVALID_INTERVAL`, `BOOKING_CONFLICT`, `OWN_BOOKING_OVERLAP`, `DAILY_LIMIT`, `WEEKLY_LIMIT`, `CHECKIN_NOT_OPEN`, `CHECKIN_EXPIRED`, `VERSION_CONFLICT`, `IDEMPOTENCY_CONFLICT`, `RETRYABLE_BUSY`. Include affected date/week and allowed amount for quota errors. Do not disclose another member's identity in conflicts.

## Security and privacy

RLS is mandatory on exposed tables. Revoke anonymous access and direct client writes; grant narrowly scoped RPC execution. Members read their own reservation history and allowance details. The calendar RPC returns only occupied intervals/status labels for others, with no email, user ID, or audit data. Admin access is checked server-side on each action.

Private tables (invitations, outbox, idempotency, sensitive audit) belong in a non-exposed schema. Privileged functions must validate the caller explicitly, use a fixed safe `search_path`, schema-qualified names, and revoked default `PUBLIC` execution. Prefer invoker functions where sufficient. Test privileges as actual anonymous/member/admin roles rather than as the database owner. See [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [database function guidance](https://supabase.com/docs/guides/database/functions).

OAuth authentication does not automatically grant building membership. A signed-in outsider must receive no calendar or booking access. The first administrator is bootstrapped by a trusted operator using an already verified auth user ID; there is no “first visitor becomes admin” flow.

The frontend receives only the publishable key. Service credentials remain in server-side secrets. Never put private data into public Pages artifacts, fixtures, logs, or source maps. Disable anonymous auth; local test helpers and clock overrides are never exposed in production.
