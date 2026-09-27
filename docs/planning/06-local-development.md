# Local build and development runbook

Status: these steps become runnable after the application and script contract are implemented. This planning-only checkout does not yet have `package.json`, a lockfile, or `supabase/config.toml`.

## Prerequisites

- Git.
- Node.js 24 LTS and npm; `.nvmrc` selects the major line.
- Docker Desktop with Linux containers/WSL2 on Windows, or another compatible container runtime. Verify it is running with `docker info`.
- A browser; Playwright installs its own test browser binaries.
- No cloud account is needed for the fully local fixture environment.

On 2026-09-27 this workstation reported Git 2.55.0.windows.4, Node v24.19.0, and npm 11.17.0. Docker was not found on PATH. Installing/starting Docker is a prerequisite, not work already completed by this planning task.

The Supabase CLI local stack requires a Docker-compatible runtime; see [local development](https://supabase.com/docs/guides/local-development). Do not expose its development services to the public internet.

## First-time implementation scaffold

Run the Vite React/TypeScript generator into a temporary sibling **inside this repository**, such as `app-scaffold`, to avoid overwriting this README and planning files. Copy the generated application/configuration files into the repository root after reviewing them; preserve existing metadata. Remove the temporary scaffold only after checking the copied result.

```powershell
npm create vite@latest app-scaffold -- --template react-ts
```

The generator is a one-time bootstrap. Record its resolved versions, install the selected dependencies from the architecture document, pin the CLI and toolchain, and commit the lockfile. Do not use floating `latest` versions in repeatable builds or CI.

Then initialize backend configuration once:

```powershell
npx supabase init
```

Implement `supabase/config.toml`, migrations, local seed/auth helpers, test configs, and the scripts below before presenting the project as runnable. Configure localhost frontend redirects and ensure Cron/extensions match the hosted environment.

## Script contract to implement

| Script | Required behavior |
| --- | --- |
| `npm run dev` | Vite on localhost:5173, strict port |
| `npm run build` | TypeScript build check, then Vite production build to `dist/` |
| `npm run preview` | Serve `dist/` on localhost:4173, strict port; local preview only |
| `npm run lint` | ESLint, zero warnings |
| `npm run format:check` | Prettier check of tracked project sources/config/docs |
| `npm run typecheck` | TypeScript without emitted application artifacts |
| `npm run test:unit` | Vitest unit/component projects, non-watch |
| `npm run test:db` | `supabase test db` against local database |
| `npm run test:integration` | Independent-session RPC/concurrency suite against local database |
| `npm run test:e2e` | Playwright against local frontend and backend |
| `npm run seed:local` | Idempotent creation of local fixture identities/members and sample bookings |
| `npm run check` | Lint, formatting, type check, unit tests, build |

Seed and integration scripts must fail closed unless explicitly targeting the local backend. They must not accept a production URL accidentally inherited from `.env.local`. Obtain privileged test credentials from a separate ignored local test environment file. Never include them in Vite configuration.

## Regular local startup after implementation

From the project root, using PowerShell:

```powershell
npm ci
npx supabase start
npx supabase status
Copy-Item -LiteralPath .env.example -Destination .env.local
```

Run the copy only on the first setup so existing local configuration is preserved. Fill `.env.local` using the local API URL and publishable key shown by the CLI; a legacy local `anon` key is also accepted by the planned client configuration. Do not copy a service-role key into it.

```powershell
npx supabase db reset
npm run seed:local
npm run dev
```

`db reset` destroys and recreates **local development data** from migrations/seeds. Use it only when that reset is intended; ordinary daily startup does not require it. Never add `--linked` or a remote database URL to this local reset recipe.

The seed supplies a clearly labeled example building timezone (`Europe/Kyiv` for fixture tests), Charger 1 and Charger 2, two resident identities, and one administrator. This is test data, not the real building configuration. Use locally confirmed test accounts and password login through test helpers only. The production app uses the configured OAuth provider; no production test-login bypass is shipped.

Local Supabase services normally expose API on 54321 and Studio on 54323; trust `supabase status` for actual ports and the local mail viewer. See [Supabase CLI workflow](https://supabase.com/docs/guides/local-development/cli-workflows).

## Frontend environment

| Variable | Local | Hosted |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Local API URL | Project URL from Supabase |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Local publishable/anon key | Hosted publishable key |
| `VITE_BASE_PATH` | `/` | `/laido-auto/` for a project Pages site; `/` for root/custom domain |
| `VITE_APP_URL` | `http://localhost:5173/` | Full canonical app URL including trailing slash/base |

All four are public build-time configuration. Changes require a rebuild. Timezone and quota policies come from the database so clients cannot alter them through environment settings.

The future Edge Function needs its own ignored environment file, with `NOTIFICATION_MODE=local_sink` for local use. Hosted mode uses the configured provider key, sender address, app URL, and a restricted invocation secret. Keep these outside the frontend environment. See [function secrets](https://supabase.com/docs/guides/functions/secrets).

```powershell
npx supabase functions serve notification-worker --env-file supabase/functions/.env.local
```

This command requires the Phase 5 function and local environment file. The local sink must never call a real email provider. Local Cron can exercise expiry without the notification function running.

## Build, test, and preview

```powershell
npm run check
npm run test:db
npm run test:integration
npx playwright install
npm run test:e2e
npm run preview
```

Use `http://localhost:4173/` for preview and configure its auth redirect separately when testing real OAuth. Vite preview is a development verification tool, not a production server. See [Vite deployment](https://vite.dev/guide/static-deploy).

Also build once with `VITE_BASE_PATH=/laido-auto/` and an appropriately based preview app URL, then visit `http://localhost:4173/laido-auto/`. This catches asset and callback path errors before Pages deployment.

After schema changes, refresh committed types:

```powershell
npx supabase gen types typescript --local | Out-File -FilePath src/lib/database.types.ts -Encoding utf8
```

Stop frontend/function terminals with Ctrl+C and stop the local stack with `npx supabase stop`. Do not delete Docker volumes as routine shutdown.

## Common failures

| Symptom | Action |
| --- | --- |
| Docker command missing / daemon unavailable | Install/start a supported runtime, enable Linux containers, verify `docker info` |
| Port conflict | Identify the owning process or explicitly change local configuration and related URLs |
| Supabase connection rejected | Confirm stack health and `.env.local`; restart Vite after env changes |
| Signed in but membership denied | Seed/claim a local invitation; do not weaken RLS to fix access |
| Static preview blank under repo path | Rebuild with the correct Vite base and visit the full base path |
| Cron unavailable locally | Enable the extension/config in migrations and confirm image compatibility; production expiry tests remain mandatory |
| Hosted OAuth needed locally | Use a separate development provider configuration and explicit localhost redirects |
