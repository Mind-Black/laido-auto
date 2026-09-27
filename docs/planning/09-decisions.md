# Decisions and launch configuration

## Confirmed by the user

| Decision | Value |
| --- | --- |
| Initial deployment scope | One building, two chargers |
| Functionality | Reservations only |
| Daily limit | 4 hours |
| Weekly limit | 12 hours |
| Counted window | Monday–Friday, 08:00–17:00 |
| No-show behavior | Release if not confirmed charging within 15 minutes of start |
| UI reference | MMI-LIMS, especially drag-to-select calendar |
| Current work | Initialize project/Git and document design, implementation, testing, local/online deployment |

## Recommended design defaults

These are explicitly identified assumptions, not additional user approvals. They permit an implementer to proceed without inventing hidden policy.

| Topic | Proposed value / rationale |
| --- | --- |
| Allowance identity | Per user across both chargers; no apartment pooling |
| Week start | Monday in building timezone |
| Grace cutoff | Check-in accepted strictly before start + 15 minutes |
| No-show allowance | Retain elapsed grace, restore released future portion |
| Minimum duration / grid | 30-minute minimum, 15-minute selection snap |
| Off-hours booking bound | End within 28 local calendar days of today; no off-hours quota |
| Own overlapping bookings | Disallowed across chargers |
| Holidays | Weekday holidays count normally |
| Identity | Google OAuth through Supabase, subject to resident account suitability |
| Hosting | GitHub Pages static frontend + hosted Supabase backend |
| Calendar refresh | Poll every 15 seconds plus mutation/focus/deadline refresh |
| Expiry sweep | Every 10 seconds, exact deadline also enforced on requests |
| Recurrence / waitlist | Deferred |
| Admin quota overrides | Not included initially; explicit audited feature if needed later |
| Notification email | Resend optional; in-app state and deadline enforcement always work |

## Required before production

- Actual building name and IANA timezone. Do not copy MMI-LIMS's lab timezone or the local fixture timezone implicitly.
- Charger labels and confirmation that both resources can be reserved independently.
- Initial administrator's verified account and member invitation list.
- Identity provider availability for residents; provision OAuth client/consent/redirect configuration.
- GitHub owner/repository, visibility, Pages availability under the chosen account, and canonical frontend URL.
- Staging and production Supabase project references, region, and account ownership.
- If email is enabled: verified sender domain, provider account, and credentials.
- Operator responsible for failures, backup retention, recovery targets, and actual service-plan costs.

Do not invent these values or commit real credentials. The application can be built and tested locally with explicit fixtures while these deployment inputs remain unset.

## Architecture decisions

1. Static frontend plus managed backend supports the requested Pages option without relying on browser timers or local storage for shared rules.
2. PostgreSQL RPCs own mutations so the critical availability/quota/check-in decision is atomic.
3. One building mutex is an intentional simplicity tradeoff for two chargers; correctness precedes hypothetical scale.
4. A custom calendar follows MMI-LIMS interaction patterns while storing continuous intervals and enforcing this app's rules.
5. OAuth return and application navigation use a real static root, avoiding Pages deep-route rewrites.
6. Notifications are asynchronous and cannot decide whether a booking is valid.

Official documentation was consulted on 2026-09-27; links are provided beside the relevant stack/runbook decisions. Provider pricing, plan limits, and dependency patch versions must be checked when provisioning or implementing; this plan does not promise a permanently free production deployment.
