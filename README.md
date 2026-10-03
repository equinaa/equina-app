# Equina

AI-assisted training and horse-care journal for riders. One rider, one horse, one coach: log the ride, keep the horse's records, and ask Ralf — the AI coach — with the session already in context.

Expo / React Native client (iOS, Android, web) on a Supabase backend (Postgres with row-level security, Edge Functions, private Storage). Ralf runs on Claude through an authenticated Edge Function; the client never holds a model key.

**Status:** pre-launch. The daily loop — account, horse with photo, ride journal, AI coach — works end to end on the production backend. Community, marketplace, messaging and push are built but switched off. See [`docs/EQUINA_NEXT_STEPS.md`](docs/EQUINA_NEXT_STEPS.md) for the plan and [`docs/EQUINA_FEATURE_FLAG_POLICY.md`](docs/EQUINA_FEATURE_FLAG_POLICY.md) for what "switched off" means.

## Stack

| Layer | What |
| --- | --- |
| Client | Expo SDK 55, React Native 0.83, React 19, TypeScript. Dev-client builds (not Expo Go). |
| Backend | Supabase: Postgres + RLS, Edge Functions (Deno), Storage (all buckets private, signed URLs), Vault, `pg_cron` |
| AI coach | `supabase/functions/coach-chat` → Anthropic Messages API (Claude). Provider is configured server-side only. |
| Lesson video | Bunny Stream (HLS). Riders get a signed link that expires, from `supabase/functions/academy-playback`; nothing is public. |
| Web hosting | Vercel, auto-deploys `main` |
| Tests | `tsx` runner; migration and RLS tests run against an isolated in-process Postgres |

## Getting started

Prerequisites: Node 22, npm, [Supabase CLI](https://supabase.com/docs/guides/local-development), and Xcode (for iOS) or Android Studio (for Android).

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local`. For a client-only setup you need two values from the Supabase project — **Project Settings → API**:

```
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Only ever put the **publishable** key in the client. The service-role key, provider keys and automation secrets in `.env.example` belong to Edge Functions and are set with `supabase secrets set`, never in Expo config and never in git. `.env*` files are ignored.

Then run:

```bash
npm run web          # browser
npm run ios          # builds a dev client and opens the iOS simulator
npm run android      # same, Android
```

`npm run ios` / `android` compile a native dev client the first time (a few minutes). After that, `npm start` serves the JavaScript and the installed client picks it up. If the iOS build picks a Mac destination instead of a simulator, run `npx expo run:ios --device` and choose one.

Set `EXPO_PUBLIC_EQUINA_DEMO_MODE=true` to explore the UI with local sample data and no backend.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm start` / `npm run web` | Metro dev server / web |
| `npm run ios` / `npm run android` | Build and run the dev client |
| `npm run build` | Static web export (what Vercel runs) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Client flows, backend contract, and migration/RLS isolation tests |
| `npm run backend:check` | Type-check every Edge Function with Deno |
| `npm run backend:audit` | Schema audit: grants, RLS, and policy coverage |
| `npm run security:bundle-scan` | Fails if a secret-shaped value would ship in the client bundle |

Run `typecheck`, `test`, `backend:check`, `backend:audit` and `security:bundle-scan` before opening a pull request.

## Project layout

```
src/
  App.tsx            Root screen tree (large; screens are being extracted into features/)
  backend/           Supabase client, repositories (records, rides, coach …)
  config/            Feature flags and runtime configuration
  domain/            Types and rules shared by client and tests
  features/          account, coach, messaging, notifications, onboarding, records, ride
  ui/                Design primitives, theme, layout, motion, states
  seed/              Local demo data (demo mode only)
supabase/
  migrations/        36 versioned migrations — the schema is the source of truth
  functions/         Edge Functions (one directory each) + _shared/
  templates/         Auth email templates
  config.toml        Project configuration (auth, storage, functions)
scripts/             Schema audit and client secret scan
tests/               Test suites and the runner
docs/                Design contracts, security model, runbook, audits, plans
```

## Backend

The database schema lives entirely in `supabase/migrations/`. Never change production by hand; write a migration.

```bash
supabase link --project-ref <ref>     # once per machine
supabase db push                      # apply pending migrations
supabase functions deploy <name>      # deploy one Edge Function
supabase config push                  # sync config.toml (auth, storage, templates)
supabase secrets set KEY=value        # server-side secrets only
```

Things worth knowing before you touch it:

- **Every table is behind RLS.** Ownership policies are the security boundary; the tests in `tests/backend-migrations.test.ts` prove Rider A cannot read Rider B, and that sharing a horse does not share its owner's ride journal. Add a test when you add a policy.
- **Storage is private.** Uploads go through `create-upload-ticket` → direct upload → `complete-upload`; reads use short-lived signed URLs. Nothing is served from a public bucket.
- **Two layers of feature flags.** `EXPO_PUBLIC_ENABLE_*` compiles a surface into the client; `public.app_feature_flags` (global rollout) and `public.feature_flag_overrides` (per user, with expiry) decide server-side whether it actually works. Both must be on. The `backend-capabilities` function reports the effective set for the signed-in user.
- **Background work** (storage cleanup, notification outbox, account deletion, order deadlines) runs as leased workers scheduled with `pg_cron`. Only storage cleanup is scheduled today.
- **Runbook:** [`docs/EQUINA_BACKEND_RUNBOOK.md`](docs/EQUINA_BACKEND_RUNBOOK.md). Security model: [`docs/EQUINA_BACKEND_SECURITY_MODEL.md`](docs/EQUINA_BACKEND_SECURITY_MODEL.md).

## Deployment

- **Web:** every merge to `main` builds and deploys on Vercel.
- **iOS / Android:** dev-client builds only, until the Apple Developer account exists. Release audit and checklist: [`docs/IOS_RELEASE_AUDIT.md`](docs/IOS_RELEASE_AUDIT.md).
- **Backend:** migrations and functions are promoted with the CLI commands above. There is one Supabase project today; treat it as production.

## Documents

Start with these, in order:

1. [`docs/PRODUCT_BLUEPRINT.md`](docs/PRODUCT_BLUEPRINT.md) — what Equina is and the wedge it launches with
2. [`docs/EQUINA_NEXT_STEPS.md`](docs/EQUINA_NEXT_STEPS.md) — the scope decision and the path to a first cohort
3. [`docs/EQUINA_TECHNICAL_DESIGN.md`](docs/EQUINA_TECHNICAL_DESIGN.md) — architecture
4. [`docs/EQUINA_FEATURE_FLAG_POLICY.md`](docs/EQUINA_FEATURE_FLAG_POLICY.md) — how surfaces go from built to live
5. [`docs/QA_SCENARIOS.md`](docs/QA_SCENARIOS.md) — what to test by hand before a release

## Conventions

- Write code that reads like the code around it. `App.tsx` is being decomposed screen by screen; when a screen gains persistence, move it into `src/features/` in the same change.
- Keep the app honest: no invented counts, progress, or engagement. Empty states are empty.
- Log without personal data. Console output must never include an email, message body, token or authorization header — a test enforces this.
- One pull request per change, against `main`, with the checks above green.

## Security

If you find a vulnerability, do not open a public issue. Contact the maintainers directly.
