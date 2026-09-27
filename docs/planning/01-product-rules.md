# Product rules

## Agreed scope

One building, two chargers, private member access, reservations only. No payments, physical charger control, electricity measurement, or automatic verification of charging. “Checked in” means a member reported charging.

Each user receives a combined allowance across both chargers:

- 4 hours per local calendar day.
- 12 hours per week.
- Only Monday–Friday between 08:00 inclusive and 17:00 exclusive counts.
- Evening, overnight, and weekend portions consume zero allowance.
- A booking can exceed four elapsed hours if its counted portions remain within both limits.

## Scheduling conventions and proposed defaults

- Weeks run Monday 00:00 through the following Monday 00:00 in the building timezone.
- Store instants as UTC timestamps; derive local days, weekdays, and weeks using a configured IANA timezone.
- Use half-open intervals `[start, end)`: one reservation may end exactly when the next starts.
- Calendar selection snaps to 15 minutes; proposed minimum reservation is 30 minutes so the check-in grace does not consume the entire session.
- Permit overnight reservations through explicit start/end dates in the booking form.
- Proposed booking horizon: the reservation must end within 28 local calendar days of today. This bounds unrestricted off-hours reservations without applying working-hours quotas to them.
- Proposed fairness rule: one user cannot hold overlapping reservations across the two chargers.
- No turnaround buffer, recurring bookings, holiday exemptions, or waitlist in the first release. Weekday public holidays still count.
- Start times must not be in the past. A “Book now” action uses server time and immediately checks in the user in the same transaction after explicit confirmation that they are charging.

These are recommended defaults, not additional requirements already confirmed by the user. See [the decision log](09-decisions.md).

## Allowance arithmetic

For each local date touched by a reservation, intersect its effective reserved interval with that date's 08:00–17:00 window when it is a weekday. Sum exact elapsed seconds, comparing against 14,400 per day and 43,200 per week. Do not round down consumption; display friendly hours/minutes separately.

Both already elapsed reserved time and future held time count. Compute allowances from reservation records, including historical consumed portions; do not maintain a resettable counter that can drift. A reservation spanning weeks is split between them. Updates exclude the old future reservation before adding the proposed replacement.

| Example | Counted time |
| --- | --- |
| Monday 07:00–10:00 | Monday: 2 hours |
| Tuesday 13:00–17:00 | Tuesday: 4 hours |
| Wednesday 16:00–20:00 | Wednesday: 1 hour |
| Thursday 18:00–Friday 09:00 | Friday: 1 hour |
| Saturday 08:00–12:00 | Zero |
| Friday 16:00–Monday 09:00 | Friday: 1 hour in the earlier week; Monday: 1 hour in the next |

Every affected date/week must pass, including dates outside the currently displayed calendar.

## Check-in lifecycle

Persist `reserved`, `checked_in`, `released_no_show`, `cancelled`, and `completed`. Derive “Upcoming” and “Awaiting check-in” from a reserved booking and server time.

Check-in opens at the start and closes at `start + 15 minutes`. Accept only when `start <= server_time < deadline`. Exactly at the deadline is too late. A confirmed check-in is idempotent. Only the booking owner can self-check-in; administrators cannot assert another person's physical presence.

The deadline is enforced all week and at every hour. Missing it releases only the remaining reservation. A late click cannot resurrect a released booking. Another booking requires fresh availability and quota validation.

For no-shows, proposed quota accounting retains the elapsed grace interval and releases the remainder. Thus an unconfirmed Monday 09:00–12:00 booking consumes 15 minutes, even if the expiry worker runs at 09:16. Store the logical release time as 09:15 and the processing time separately.

For ordinary cancellations before the start, restore all allowance. After the start, retain elapsed reserved time and release future time. “Finish early” is the checked-in equivalent. Completed reservations count their reserved interval because actual consumption is not measured.

Users may reschedule future reservations. Once started, the start and check-in deadline are immutable; extensions must pass conflict/quota validation. A released reservation cannot be extended. Administrative corrections require a reason and audit entry.

## Maintenance and outages

Administrators can block either charger. A maintenance block overlapping a reservation must be rejected with affected bookings listed; the administrator must explicitly cancel those bookings before creating the block. No silent displacement.

If the API is unavailable, show that status and disable writes/check-in rather than claiming success locally. The deadline still follows server time. An administrator handles incidents after recovery; there is no automatic grace extension or offline check-in queue.
