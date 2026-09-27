# Online deployment and operations

This is a future deployment runbook. No remote repository, hosted project, workflow, or public site has been created by the planning task. Commands require the implemented application, migrations, and named scripts.

## Hosting model

Use GitHub Pages for the built frontend and Supabase for PostgreSQL, Auth, RPCs, scheduled jobs, and the notification function. A static Pages deployment alone cannot deliver shared reservations or reliable expiry.

Choose GitHub repository visibility and a plan that supports Pages for it. The public app shell must contain no private resident data. Backend membership checks protect the actual data. Review [Pages usage limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) for the intended deployment; Pages is not the hosting choice for a future commercial booking SaaS. The proposed production login redirects to the identity provider and does not collect passwords in a Pages form.

If hosting requirements change, the same `dist/` artifact can move to a static host with the correct base/app URL. Supabase remains the backend; there is no frontend-host lock-in.

## Environments and prerequisites

| Environment | Frontend | Backend | Data |
| --- | --- | --- | --- |
| Local | Vite / local preview | Docker Supabase | Synthetic fixtures |
| Staging | Dedicated staging Pages repository/site or separate static host | Separate hosted Supabase project | Synthetic data, tester accounts |
| Production | Main Pages repository/site or custom domain | Production Supabase project | Real memberships and reservations |

GitHub Pages is not assumed to provide automatic per-PR preview environments. Keep staging and production URLs/projects distinct. Do not point local destructive test commands at either hosted database.

Needed accounts: GitHub with repository administration, Supabase with project administration, an identity-provider console account, and optionally Resend plus a sender domain. Select a supported region and a service plan suitable for always-available bookings, jobs, and backups; inspect current plan limits/costs at provisioning time. Record project ownership and billing owner.

## 1. Prepare the remote repository

After code and checks are ready, create an empty GitHub repository in the intended owner account. This runbook does not assume the GitHub CLI is configured. Configure local Git author identity if absent, then create the initial commit and remote using the chosen URL:

```powershell
git add .
git commit -m "Initialize Laido Auto"
git remote add origin https://github.com/OWNER/REPOSITORY.git
git push -u origin main
```

Replace `OWNER/REPOSITORY`; inspect staged files before committing. If a commit/remote already exists, use the normal incremental workflow instead of repeating initialization.

Protect the main branch with passing CI checks. In Settings > Pages, select **GitHub Actions** as the deployment source. See [Vite's Pages deployment instructions](https://vite.dev/guide/static-deploy).

## 2. Provision Supabase and identity

For staging first, then production:

1. Create a Supabase project and record its reference, API URL, publishable key, and database password in the correct environment/secret stores.
2. Enable the chosen Google OAuth provider. Configure the provider consent/audience and allowed test users as appropriate. Register the provider callback displayed by Supabase, typically `https://PROJECT_REF.supabase.co/auth/v1/callback`, with Google. Keep the OAuth client secret in Supabase settings.
3. Set Supabase Auth Site URL and an explicit redirect allowlist to the full frontend root, including repository base and trailing slash. Example: `https://OWNER.github.io/REPOSITORY/`. Staging gets its own URL. Use PKCE in the app and test the complete redirect exchange.
4. Keep membership separate from authentication: only an invitation matching a provider-verified email grants access. Disable anonymous sign-in and unused providers.
5. Apply migrations, enable/verify the required extensions (`btree_gist`, `pg_cron`, and `pg_net` if used for function dispatch), and confirm job installation is idempotent.
6. Bootstrap the real building, its required IANA timezone, the two charger labels, and the first admin's verified auth user ID using a trusted operator script. Never run local auth/sample-data seeds against production.

Use [Supabase's Google setup](https://supabase.com/docs/guides/auth/social-login/auth-google) and [environment deployment guide](https://supabase.com/docs/guides/deployment/managing-environments) for provider and CLI configuration.

One-time operator commands after local migration tests pass:

```powershell
npx supabase login
npx supabase link --project-ref YOUR_STAGING_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
```

Confirm the project reference before pushing. Repeat against production only for the intended release after staging validation. `db push` is the migration path; `db reset` is not a production deployment command. Keep migrations in Git and avoid undocumented production SQL edits.

## 3. Configure notifications

Core booking/check-in/expiry works without outbound email. If enabled, verify a Resend sender domain and store the following only in the Edge Function's secret environment: `RESEND_API_KEY`, `NOTIFICATION_FROM`, `APP_URL`, `NOTIFICATION_MODE=resend`, and a generated `NOTIFICATION_WORKER_SECRET`.

Store the worker invocation secret in the database's managed secret facility for scheduled invocation. The function authenticates that secret before touching the outbox. Do not disable gateway JWT verification without implementing and testing this dedicated worker authentication. The cron caller/function configuration must agree on the chosen scheme; browser sessions cannot invoke the worker.

Load secrets from an ignored local file and deploy the implemented function:

```powershell
npx supabase secrets set --env-file .env.functions.production
npx supabase functions deploy notification-worker
```

The file is operator-created and ignored by `.gitignore`; it must never contain frontend `VITE_` names. The linked project must be production for this particular recipe. For staging use its own secret file/project. See [Edge Function secrets](https://supabase.com/docs/guides/functions/secrets).

Install a one-minute outbox-dispatch schedule and the ten-second expiry/completion schedule through reproducible migrations/configuration. Keep invocation secrets out of migration text. Check job execution and function authentication on the actual hosted project, including duplicate-job prevention on redeploy.

## 4. Configure GitHub environments

Create separate `staging` and `production` environments. Public configuration may be Actions variables; credentials must be environment-scoped secrets.

| Name | Kind | Used by |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Public variable | Frontend build |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public variable | Frontend build |
| `VITE_BASE_PATH` | Public variable | `/REPOSITORY/` or `/` |
| `VITE_APP_URL` | Public variable | Full canonical frontend root |
| `SUPABASE_PROJECT_REF` | Variable | Backend deploy |
| `SUPABASE_ACCESS_TOKEN` | Secret | CLI deployment authentication |
| `SUPABASE_DB_PASSWORD` | Secret | CLI remote database access |

Service-role credentials, notification secrets, and OAuth client secrets must never be injected into the Vite build. GitHub's generated deployment token handles Pages publishing; no personal GitHub token belongs in frontend code. Environment values are different for staging and production.

For a project site, Vite's base is `/REPOSITORY/`; for `OWNER.github.io` root or a custom-domain root, use `/`. Changing this requires rebuilding. If adding a custom domain, configure DNS, Pages domain/HTTPS settings, the app URL, OAuth origins/redirects, and any static `CNAME` artifact consistently.

## 5. Implement release workflows

Create these workflow files in Phase 6; none exist yet:

- `ci.yml`: run the gates in [testing](07-testing.md) using a disposable local Supabase stack. Pull requests never receive hosted deployment secrets.
- `deploy.yml`: manual release or protected-main/tag trigger, environment selection, serialized deployment per environment, and a reference to the exact tested commit.

Release job order:

1. Check out the selected commit and install Node 24, pinned CLI, and locked npm dependencies.
2. Run all required checks. Build with the selected frontend variables.
3. Apply additive/backward-compatible database migrations to the selected project and deploy functions. Abort frontend publication if backend deployment fails.
4. Configure Pages, upload only `dist/`, and deploy the Pages artifact through official Actions.
5. Run hosted smoke checks and record frontend URL, commit, migration version, and results.

The Pages publishing job needs `contents: read`, `pages: write`, and `id-token: write`; other jobs receive only their necessary permissions. Use a GitHub deployment environment as required by Pages, distinct from backend secret scopes where necessary. Pin Action releases to verified commit SHAs during implementation. Follow the official [Pages Actions workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

Do not cancel a release midway through a database migration to favor a newer push; serialize releases. GitHub Actions is used for deployment, not for the 15-minute booking expiry timer.

## 6. Hosted smoke checklist

- Asset loading and page refresh work at the exact repository/custom-domain URL.
- Real provider login returns to the app; outsider accounts see no building data.
- Two member accounts demonstrate conflict handling and shared per-user allowance across both chargers.
- Working-hour calculations display in the configured building timezone.
- An unconfirmed booking releases at its logical deadline without any browser running; the next visitor can book it.
- Late check-in fails, while valid check-in persists across reloads.
- Maintenance blocks, administrative permissions, and redacted calendar responses behave correctly.
- Jobs/outbox show healthy operation; email, if enabled, uses the correct app URL.
- No credentials or personal fixtures are present in the deployed artifact.

## Monitoring, backup, and recovery

Record last successful sweep and sweep delay; alert the operator if it remains unhealthy for more than two minutes. Monitor failed RPCs, database availability, oldest pending notification, and repeated delivery failures. Read-time reconciliation preserves correct expiry semantics while a sweep is late, but an unavailable backend prevents all booking/check-in writes.

Proposed recovery targets for this small shared facility: RPO 24 hours and RTO 4 hours, to be confirmed by the operator. Choose a plan/backup process that actually meets them; no free-tier backup guarantee is assumed. Keep encrypted database backups outside the live project and periodically restore to a disposable project. Verify membership/Auth recovery and external provider settings as well as booking rows. Never put dumps or credentials in this repository.

For a bad frontend release, redeploy the last known-good commit/artifact. Database migrations remain in place, so releases must retain compatibility with the previous frontend. Fix schema problems with a forward migration; destructive rollback requires a tested restore and an explicit data-loss assessment. If a migration succeeds but frontend publishing fails, continue serving the prior compatible frontend and retry publishing.

During a severe incident, disable new booking mutations through an audited maintenance mode while keeping existing reservations readable if possible. After restoring a backup, reconcile reservations with residents/admins before reopening, since recent bookings may be missing. Audit any manual cancellations or corrections; do not claim physical charger availability from database state alone.
