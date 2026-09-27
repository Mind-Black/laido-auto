# Laido Auto

A private web app for reserving two shared EV chargers in one building.

## Project status

**MVP Implemented & Tested.** The React + TypeScript + Vite web app is implemented with full business rules, calendar scheduling, allowance tracking, check-in lifecycle, and automated test coverage.

## Features

- **Two Independently Bookable Chargers**: Reserve Charger 1 and Charger 2.
- **Allowance Arithmetic**: 4 hours per day and 12 hours per week combined across chargers, counting only Monday–Friday 08:00–17:00 in the building timezone (`Europe/Kyiv`). Off-hours (evenings and weekends) consume zero allowance.
- **Check-in Lifecycle**: Awaiting check-in countdown banner with "I'm charging" button. Must be confirmed within 15 minutes of start or remaining reservation is released (no-show retain grace rule). "Finish early" releases unused time.
- **MMI-LIMS Inspired Calendar**:
  - Week view (7 days Mon–Sun for selected charger) and Day view (both chargers side-by-side).
  - 15-minute slot snapping with drag-to-select range preview.
  - Visual weekday allowance window shading ("Counts toward allowance").
  - Current-time horizontal line indicator.
- **Security & Multi-user Support**:
  - Strict `.gitignore` protecting `.env`, `.env.local`, and secrets.
  - 0 vulnerabilities across dependencies (`npm audit`).
  - Seamless local sandbox mode for rapid testing plus Supabase schema/migrations for production deployment.

## Available Scripts

```bash
# Install dependencies
npm ci

# Run development server (localhost:5173)
npm run dev

# Run full test suite (20 tests: allowance rules, check-in deadlines, components)
npm run test:unit

# Type check
npm run typecheck

# Lint (zero errors / warnings)
npm run lint

# Production build (outputs to dist/)
npm run build

# Local preview / deployment test (localhost:4173)
npm run preview

# Complete quality gate (lint, typecheck, test, build)
npm run check
```

## Security & Environment Configuration

- Copy `.env.example` to `.env.local` to connect a live Supabase instance:
  ```bash
  Copy-Item .env.example .env.local
  ```
- **Never commit `.env` or `.env.local` files**: `.gitignore` strictly ignores all `.env*` files except `.env.example`.
- Never place service-role keys or database credentials in client variables (`VITE_*`).
