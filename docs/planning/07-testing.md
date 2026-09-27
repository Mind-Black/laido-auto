# Testing and acceptance criteria

No tests have been implemented or run in this planning-only repository. The following is the required verification plan for the future application.

## Test layers

- Vitest: timezone/selection helpers, form validation feedback, countdown display, component accessibility. UI preview calculations share fixtures with authoritative SQL calculations.
- pgTAP: database interval arithmetic, grants/RLS, lifecycle, transaction outcomes, policy boundaries.
- Independent-session integration tests: concurrent calls with barriers, not sequential requests labeled as races.
- Playwright: browser flows against a real local Supabase instance, two independent users, and production-path builds.
- Manual hosted smoke: real OAuth/provider configuration and scheduled job operation.

Tool setup references: [Vitest](https://vitest.dev/guide/), [Playwright](https://playwright.dev/docs/intro), and [Supabase database testing](https://supabase.com/docs/guides/database/testing).

## Required rule fixtures

| Case | Expected result |
| --- | --- |
| Mon 07:00–10:00 | 2 counted hours |
| Mon 16:00–20:00 | 1 counted hour |
| Sat or Sun daytime | Zero counted hours |
| Exactly 08:00 / 17:00 boundaries | Count 08:00 onward; no time after 17:00 |
| 4 counted hours on one date | Accepted |
| Existing 4 hours plus any positive working-time amount | Daily limit rejected |
| Three days of 4 hours | 12-hour weekly allowance reached |
| Fourth day with working-time booking | Weekly limit rejected |
| Booking on other charger | Same user's daily/week usage remains combined |
| Fri 16:00–Mon 09:00 | 1 hour in each affected week |
| Overnight weekday crossing | Assign counted portions to their actual local dates |
| DST spring/fall weekend, UTC date differing from local date | Correct weekday/week buckets; no assumption that every local day has 24 hours |
| Ambiguous/nonexistent local form time | Require an explicit offset choice or reject with explanation; never silently shift |
| Future cancellation | Entire allowance restored |
| Cancellation after start | Elapsed portion remains counted |
| Missed Mon 09:00–12:00 booking | Effective end 09:15; 15 minutes counted |
| Worker processes that no-show at 09:20 | Still only 15 minutes counted |
| Missed evening/weekend booking | Released with zero quota consumption |
| Failed reschedule / resize | Original reservation and allowance unchanged |
| Adjacent reservations | Accepted when first end equals second start |
| Booking overlapping maintenance | Rejected |
| Proposed one-user overlap rule | Simultaneous own reservations on different chargers rejected |

## Check-in and concurrency

Test just before start, exactly at start, just before deadline, and exactly at/after deadline. Unit-test a pure internal decision helper with explicit instants; do not expose a client-controllable clock in production. Integration tests seed relative-time records through a privileged local fixture path.

Race scenarios must include:

1. Two users request the same charger/time: exactly one succeeds.
2. One user requests non-overlapping times on different chargers that together exceed a quota: at most the allowed combination succeeds.
3. Check-in and expiry compete: one consistent terminal outcome, with no resurrection.
4. Two retries with one idempotency key: one reservation and one event set.
5. Same idempotency key, different payload: explicit conflict.
6. Two edits from the same initial version: one wins; the other gets a version conflict.
7. Maintenance creation and booking compete: no overlap in committed state.
8. A lock wait crosses the deadline: the captured clock after the lock rejects late check-in.
9. Cron is disabled and an expired row persists: a new booking succeeds after request-time reconciliation.
10. A member is deactivated concurrently: authorization is checked under the shared mutation lock.

Inspect final database state, allocations, usage, and audit/outbox rows in every race test. Do not rely only on HTTP return codes.

## Access control

Assert anonymous callers and authenticated non-members cannot list calendars, read reservations, call mutation RPCs, or subscribe to private data. Members cannot edit others' bookings, grant themselves admin, forge identity, bypass quotas with direct table writes, invoke expiry jobs, or read invitation/outbox/audit internals. Admin controls require an active admin membership. Member-facing errors and calendar payloads must not expose another resident's email/user ID.

Verify every privileged function's grants and search path. Inspect the built frontend for accidental service credentials and confirm no test-login or test-clock endpoint is enabled in hosted mode.

## Browser acceptance

Complete drag-select/confirm, form-only booking, move/resize/save/cancel, charger switching, mobile scrolling and selection, allowance errors, My bookings, self-check-in, and no-show release from another session. Cover keyboard focus and Escape behavior, loading/error states, session expiry, reconnect, and a suspended tab's countdown correction.

Run Chromium flows on each PR. Run Firefox/WebKit and mobile-size projects before release. Check light/dark themes, zoom, contrast, labels, touch targets, and visible focus. Test the repository base path and OAuth return root separately.

## Notification and operations tests

Worker retries cannot send stale reminders after check-in/cancellation. Use provider idempotency where supported; document that external delivery is at-least-once unless provider deduplication guarantees otherwise. Verify worker crash/lease recovery and that provider failure never affects booking commits. All tests use a sink/stub, never real recipients.

Verify migration from an empty database and from the previous release, backward compatibility with the prior frontend, scheduler health reporting, and a restore into a disposable project.

## CI gates

Every PR: locked install, formatting/lint/type checks, unit/component suite, local backend start/reset, SQL tests, concurrency suite, browser smoke, and production build. Use disposable test data and no production credentials. Fork PRs receive no deployment secrets.

Release: all gates plus cross-browser coverage, staging OAuth and expiry checks, migration review, and artifact/config verification. Save failing Playwright traces and test logs with short retention and no real personal data.

For the current documentation-only change, verify file links, required topic coverage, Git state, and whitespace. Do not claim the future application suite has passed.
