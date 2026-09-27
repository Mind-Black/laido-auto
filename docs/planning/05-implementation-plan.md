# Implementation plan

All phases below are pending. The current repository contains only planning documents and repository metadata.

## Phase 1 — Runnable foundation

1. Scaffold React/TypeScript with Vite while preserving existing files. Add styling, linting, formatting, test tools, the Supabase client, query cache, and timezone library.
2. Pin compatible dependencies and Supabase CLI; commit the lockfile. Set Node 24 in CI and document the tested patch version.
3. Implement the script contract in the local guide and configuration validation. Reject placeholder/missing frontend settings with an actionable startup screen.
4. Initialize Supabase configuration with a Docker-compatible local runtime. Add separate application/backend environment templates.
5. Establish query-string navigation and test both `/` and `/laido-auto/` asset bases.

Exit: clean checkout installs, builds, opens locally, and passes lint/type/unit smoke checks. These checks need no hosted account. CI performs the same checks.

## Phase 2 — Schema, membership, and correctness

1. Add migrations for all records, constraints, indexes, privileges, and RLS.
2. Build the common building-lock transaction path, effective interval/quota calculations, and create/update/cancel operations.
3. Add idempotency and edit versions; keep domain error responses typed.
4. Add local seed data and local-only test identities. Implement membership claim and audited administrator bootstrapping.
5. Write SQL acceptance tests and independent-session race tests before connecting writes to the calendar.

Exit: concurrent bookings cannot overlap or exceed user allowances. Anonymous users and authenticated outsiders see no private data. A failed reschedule preserves the original booking. Local reset recreates a working fixture database.

## Phase 3 — Calendar and resident workflows

1. Implement login/session/membership gates and redacted calendar RPC reads.
2. Build day/week grid, navigation, sticky headers, working-window shading, current-time line, and responsive layout.
3. Add pointer drag selection and form/keyboard equivalents; preview counted time without creating holds.
4. Add explicit confirmation, move/resize editing, My bookings, cancellation, and usage displays.
5. Add polling/focus refresh and error/empty/offline handling.

Exit: two browser sessions demonstrate conflict handling; all primary actions work with mouse and keyboard and are usable on mobile. MMI-LIMS-inspired interactions are verified manually.

## Phase 4 — Check-in and expiry

1. Implement owner-only check-in, finish early, atomic Book now, and deadline immutability after start.
2. Add scheduled expiry/completion and request-time reconciliation; capture server time after locking.
3. Add active booking banner, countdown, deadline feedback, and released-state history.
4. Prove no-show usage cutoff is the deadline even when processing is delayed.
5. Test worker restart, check-in versus expiry races, retries, and disabled-worker fallback.

Exit: a missed booking becomes available at the logical deadline without an open client; a new request can acquire it even if the scheduled sweep is late. A late check-in cannot restore it.

## Phase 5 — Administration and notifications

1. Add audited member activation/deactivation, maintenance creation/removal, and explicit booking cancellation.
2. Prevent maintenance from silently replacing reservations and prevent removal of the last active administrator.
3. Implement outbox reminders/confirmation/cancellation events, local notification sink, delivery leases, and retries.
4. Add the optional hosted Resend adapter and restricted worker invocation; never send real email in local/CI tests.
5. Expose basic job/outbox health to administrators.

Exit: administrative actions enforce permissions; stale/duplicate reminders are suppressed; provider downtime has no effect on reservations.

## Phase 6 — Hosted staging and production readiness

1. Provision a staging Supabase project and frontend URL, configure the identity provider, and migrate the database.
2. Add CI gates and a serialized release workflow: test, migrate backend, deploy functions, then publish the static frontend.
3. Configure production separately, including real timezone, members, OAuth redirects, notification sender, and backup policy.
4. Run the hosted smoke suite, including real OAuth, base path, two-account conflict, and no-show release.
5. Exercise frontend rollback and a database restore on a disposable project; record the procedure.

Exit: a tagged release is reproducible, has passed staging, and can be deployed from a known commit. Production is not declared complete until hosted smoke checks and operational setup pass.

## Definition of done for each implementation change

Relevant tests pass; types and lint pass; the matching docs reflect final behavior; no secret enters the client bundle; migration changes are reproducible; user-visible calendar changes receive browser inspection. Do not add placeholder passing tests in place of the specified behavioral checks.

## Deferred scope

Payments, OCPP/device control, energy metering, recurring bookings, waitlists, multi-building administration, automatic penalties for repeated no-shows, and native mobile apps require separate product decisions.
