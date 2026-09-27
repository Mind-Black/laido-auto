# Calendar and interface design

## Reference inspected

MMI-LIMS at `C:/Users/minjuo/Dev/MMI-LIMS`, inspected read-only on 2026-09-27:

- `src/components/BookingModal.jsx`: weekly grid, sticky day headings, Today/previous/next navigation, drag selection, touch selection, booking edit panel.
- `src/components/UserBookingsCalendar.jsx`: full-day time axis, scrollable week, highlighted today, current-time line, compact cards.
- `src/hooks/useBookingInteraction.js`: move/resize previews, snapping, collision feedback, pointer movement threshold.
- `src/styles/components/calendar.css`: sticky headers and time labels, neutral light/dark surfaces.

Adapt the interaction and visual vocabulary. Do not import the lab's project fields, tools, permission model, timezone, 30-minute slot storage, or code wholesale. Our reservations are continuous timestamp intervals; a drag across a conflict must not silently skip occupied cells and create fragmented bookings.

## Desktop layout

```text
Laido Auto                 Building timezone       My bookings   Account
Your active booking: Charger 1     Confirm by 09:15   [I'm charging]
Today: 1h 30m / 4h          This week: 7h / 12h

[<] [Today] [>]  28 Sep–4 Oct       [Day | Week] [Charger 1 | 2]
+-------+--------+--------+--------+--------+--------+--------+--------+
| Time  | Mon    | Tue    | Wed    | Thu    | Fri    | Sat    | Sun    |
+-------+--------+--------+--------+--------+--------+--------+--------+
| 08:00 |           weekday allowance window lightly shaded          |
| 08:15 | [mine] |        | [busy] |        |        |        |        |
| ...   |        |        |        |        |        |        |        |
+-------+--------+--------+--------+--------+--------+--------+--------+
Selection: Mon 10:00–12:00 | 2h counted | Daily 3h 30m/4h | [Reserve]
```

Week view shows one selected charger across seven days. Day view shows both chargers side by side. A booking form can switch chargers after revalidation. The full 24-hour day is available; initial scroll is near the current time or 08:00. Weekend columns remain usable.

## Interaction contract

1. Pointer-down on an available cell starts selection on one charger and one date.
2. Drag up or down to preview a continuous range, snapping to 15-minute boundaries. Keep time labels and duration visible. Auto-scroll near the grid edge.
3. Mark collision, past time, minimum duration, or allowance failure with a message; color alone is insufficient. Do not clip a selection into multiple reservations.
4. Pointer-up opens or populates the booking summary. Nothing is booked until the explicit Reserve action succeeds.
5. The form shows start/end dates and times, charger, total duration, weekday-counted duration, affected daily/week allowances, and check-in deadline. Overnight booking uses explicit dates here.
6. Show submit progress and a server-confirmed result. Preserve selection on conflict and offer refresh or another charger.

Dragging/resizing existing future bookings shows a preview and asks the user to save the change. Escape cancels. Invalid drops retain the original reservation. In-progress reservations cannot move or change start; permitted end edits still go through server validation.

## Visual language

Use a neutral gray/white application surface, rounded cards, fine grid lines, blue selection/own bookings, and a restrained dark theme. Use amber for awaiting check-in and green for checked-in reservations. Other members' reservations use neutral “Reserved” cards, and maintenance uses a labeled hatch pattern.

Shade only Monday–Friday 08:00–17:00 and label it “Counts toward allowance.” Display “Outside allowance hours” in applicable booking summaries. An admin screen is a separate tab, not extra clutter in the resident calendar.

## Check-in experience

Keep the active booking banner above the calendar on every signed-in screen. The button text is “I'm charging”; show the exact local deadline and a countdown based on returned server time. Reconcile time after tab resume. Check-in only succeeds after a server response, with a visible timestamp.

At expiry, show “Released — no check-in” and refresh availability. Do not show a green success state for an offline or late click. A start reminder and a start + 10-minute reminder link to the actual app root with a booking ID query parameter; ownership is checked after login.

## Mobile and accessibility

- Default to day view; charger switcher or horizontally scrollable two-column view according to available width.
- Preserve ordinary vertical scrolling. Enter touch selection through a deliberate long press or the New booking button; capture the pointer only while selecting.
- Every drag action has editable start/end fields and keyboard controls. Announce selection and validation feedback through a live region without announcing every pixel movement.
- Use visible focus, labeled buttons, accessible modal focus management, adequate contrast, and at least 44px touch targets.
- Test keyboard-only, touch, screen-reader labels, browser zoom, narrow screens, reduced motion, and both themes.

## Additional screens and states

Login and membership denied; My bookings with upcoming/history filters; booking details; administration for member access, maintenance, audit and job status. Handle loading, empty calendar, conflict, stale version, exceeded allowance, expired session, API unavailable, and notification failure explicitly.

The UI must never describe a charger as physically free or electrically charging: it knows reservation and self-check-in status only.
