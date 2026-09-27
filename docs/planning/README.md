# Design and implementation plan

Prepared 2026-09-27. This directory is the build specification for Laido Auto. No application code exists yet.

| Document | Purpose |
| --- | --- |
| [01 — Product rules](01-product-rules.md) | Agreed requirements, allowance arithmetic, lifecycle, and defaults |
| [02 — Architecture and stack](02-architecture-stack.md) | Components, technology choices, dependencies, and deployment topology |
| [03 — Data and API](03-data-api.md) | Schema, transaction algorithm, authorization, and API contracts |
| [04 — Calendar UX](04-calendar-ux.md) | MMI-LIMS reference, layouts, interaction, accessibility, and states |
| [05 — Implementation plan](05-implementation-plan.md) | Ordered milestones with completion criteria |
| [06 — Local development](06-local-development.md) | Prerequisites, first scaffold, environment variables, and local commands |
| [07 — Testing](07-testing.md) | Business-rule fixtures, concurrency tests, browser tests, and CI gates |
| [08 — Deployment and operations](08-deployment-operations.md) | GitHub Pages + Supabase deployment, secrets, rollback, and monitoring |
| [09 — Decisions and open configuration](09-decisions.md) | Accepted requirements, proposed defaults, and launch inputs |

## Reading and change order

Product rules are the source of truth for behavior. Data/API and testing documents translate those rules into implementation requirements. Update all affected documents when a rule changes.

The user explicitly approved the charger count, weekday allowance window, allowance quantities, reservations-only scope, 15-minute check-in, and MMI-LIMS inspiration. Other choices are implementation recommendations, identified in the decision log. They can be developed as defaults; the real building timezone and external credentials must be supplied before launch.

## Definition of a working release

A resident can sign in, drag-select a reservation, see correct allowances, check in, and cancel. Another resident sees newly available time after a no-show. Database tests prove that concurrent clients cannot double-book or exceed allowances. Local setup is reproducible, and the same release passes smoke tests on its hosted URL.

## Current deliverable

Repository metadata, environment template, and documentation only. There is no deployed website or configured remote repository. All `npm run` commands and application-specific scripts in these documents are contracts to implement in Phase 1 or the indicated later phase.
