# Laido Auto

A private web app for reserving two shared EV chargers in one building.

## Project status

Planning only. Git is initialized on `main`. No application, dependencies, database migrations, automated tests, or deployment workflows have been implemented yet. The commands in the planning documents describe the implementation target, not a currently runnable application.

Start with the [design and implementation plan](docs/planning/README.md).

## Agreed behavior

- Two independently bookable chargers; reservations only.
- Per-user allowance across both chargers: 4 hours per day and 12 hours per week, counting only Monday–Friday, 08:00–17:00 in the building timezone.
- Confirm “I'm charging” within 15 minutes of the booking start or release the remaining reservation.
- Calendar inspired by MMI-LIMS, including drag-to-select booking.

## Selected architecture

React + TypeScript + Vite frontend; Supabase Auth, PostgreSQL transactional functions, and scheduled jobs for the backend. GitHub Pages is a frontend hosting option; Supabase hosts shared data and enforces deadlines independently of browsers.

## Next implementation step

Follow [Phase 1](docs/planning/05-implementation-plan.md): scaffold the application and local backend, pin dependency versions, and establish the build/test commands. Preserve this planning directory when scaffolding.

Local inspection on 2026-09-27 found Git, Node 24, and npm installed. Docker was not available on PATH. See the [local setup guide](docs/planning/06-local-development.md).
