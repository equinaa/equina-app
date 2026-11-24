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
| Lesson video | Mux (HLS). Staff upload from the admin straight to Mux; riders get a signed link that expires, from `supabase/functions/academy-playback`; nothing is public. |
| Admin | Next.js 16 in [`admin/`](admin/README.md): staff publish lessons and moderate the Club. Its own Vercel project; staff sign in with a password and an authenticator code. |
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
| `npm run security:bundle-scan` | Fails if a secret-shaped value would ship in the client bundle. Reads the web export in `dist`; run `npx expo export --platform all --no-bytecode --clear` first to include the iOS and Android bundles. Keep `--clear` (for the web export alone, `npm run build -- --clear`): Metro's cache is shared by every checkout on this machine and does not notice a changed `EXPO_PUBLIC_` value, so without it an export can carry the values of an earlier one |

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
admin/               Staff console (Next.js), deployed separately — see admin/README.md
supabase/
  migrations/        Versioned migrations — the schema is the source of truth
  functions/         Edge Functions (one directory each) + _shared/
  templates/         Auth email templates
  config.toml        Project configuration (auth, storage, functions)
scripts/             Schema audit, client secret scan, EAS build guard
tests/               Test suites and the runner
docs/                Design contracts, security model, runbook, audits, plans
```

## Backend

The database schema lives entirely in `supabase/migrations/`. Never change production by hand; write a migration.

```bash
supabase link --project-ref <ref>     # once per machine
supabase db push                      # apply pending migrations
supabase functions deploy <name>      # deploy one Edge Function
supabase secrets set KEY=value        # server-side secrets only
```

**Never run `supabase config push` against the hosted project.** Its Auth settings (email confirmation, the SMTP sender, the email templates, the redirect URLs) are set by hand in the Dashboard, and a push overwrites them with whatever `supabase/config.toml` declares. That file describes the local stack. For some weeks in late 2026 it had email confirmation turned off, and a push then would have stopped the hosted project from confirming new sign-ups: anyone could have signed up with an invited address and walked through the beta door. Keep the two in step by hand, as [`docs/EQUINA_AUTH_DELIVERY.md`](docs/EQUINA_AUTH_DELIVERY.md) describes.

Things worth knowing before you touch it:

- **Every table is behind RLS.** Ownership policies are the security boundary; the tests in `tests/backend-migrations.test.ts` prove Rider A cannot read Rider B, and that sharing a horse does not share its owner's ride journal. Add a test when you add a policy.
- **Storage is private.** Uploads go through `create-upload-ticket` → direct upload → `complete-upload`; reads use short-lived signed URLs. Nothing is served from a public bucket.
- **Two layers of feature flags.** `EXPO_PUBLIC_ENABLE_*` compiles a surface into the client; `public.app_feature_flags` (global rollout) and `public.feature_flag_overrides` (per user, with expiry) decide server-side whether it actually works. Both must be on. The `backend-capabilities` function reports the effective set for the signed-in user.
- **Background work** (storage cleanup, notification outbox, account deletion, order deadlines) runs as leased workers scheduled with `pg_cron`. Only storage cleanup is scheduled today.
- **Runbook:** [`docs/EQUINA_BACKEND_RUNBOOK.md`](docs/EQUINA_BACKEND_RUNBOOK.md). Security model: [`docs/EQUINA_BACKEND_SECURITY_MODEL.md`](docs/EQUINA_BACKEND_SECURITY_MODEL.md).

## Deployment

- **Web:** every merge to `main` builds and deploys on Vercel.
- **Admin:** a second Vercel project with Root Directory `admin`. Setup and staff accounts: [`admin/README.md`](admin/README.md).
- **iOS / Android:** built by EAS for TestFlight and Google Play, see [Store builds](#store-builds). Release audit and checklist: [`docs/IOS_RELEASE_AUDIT.md`](docs/IOS_RELEASE_AUDIT.md).
- **Backend:** migrations and functions are promoted with the CLI commands above. There is one Supabase project today; treat it as production.

## Store builds

EAS makes the TestFlight and Google Play builds from `eas.json`. A build made there never sees `.env.local`, so what the app reads when it is bundled comes from two places, and a name lives in only one of them:

| Where | What |
| --- | --- |
| `eas.json`, the `env` of `preview` and `production` | The switches: sign-in by email code, and each feature on or off. Reviewed in git. |
| EAS environment variables, `preview` and `production` | `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. Never committed: this repository has a public mirror. |

Set the two variables once. Plain text is right for them: they ship inside the app anyway, and EAS CLI cannot read a secret one back to check it.

```bash
npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_URL --value "https://<project-ref>.supabase.co" --environment preview --environment production --visibility plaintext
npx eas-cli@latest env:set --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value "<publishable key>" --environment preview --environment production --visibility plaintext
```

- **Profiles.** `development` is the dev client. `preview` installs from a link, for the team: an APK on Android, ad hoc on iOS. `production` goes to the stores. EAS keeps the build number and raises it for every `preview` and `production` build, so no build edits `app.json` and the version line in Account names one build only. All three use the Node pinned in `base`.
- **The guard.** `scripts/eas-build-guard.mjs` runs on EAS before `npm install` and fails the build when a backend variable is missing, sign-in is not by code, the demo is on, a RevenueCat key or a privacy link is present (see "Selling stays off"), or a switch is not what `eas.json` says. It prints names, never values. To check from your machine before spending a build:

  ```bash
  npx eas-cli@latest env:exec production "node scripts/eas-build-guard.mjs --rehearse production"
  ```

  The rehearsal also asks the project itself whether the address and the key are its own (one request for the auth service's public settings), because a wrong letter or a key cut short has the right shape and still makes a build nobody can sign in to. Add `--offline` to skip that question.

- **Local builds.** `eas build --local` runs the same guard, and its `.ipa` or `.aab` can go to a store like any other. It is not the same build, though: it uses the Node installed on this computer, not the one pinned in `base`, and it cannot read an EAS variable of Secret visibility, one more reason the two above are plain text. It also takes whatever the terminal exports. The guard's first line lists every `EXPO_PUBLIC_` name the build sees: read it before you submit.
- **Local builds and `CI`.** With `CI` set, Expo skips the cache reset the native build asks for, and Metro's cache, shared by every checkout on this machine, can hand the app the `EXPO_PUBLIC_` values of an earlier bundle. The guard stops a local build from a terminal that sets `CI`; run `unset CI` first. EAS's own machines start with an empty cache.
- **Check the finished file before you submit it.** The guard reads the environment, not what was compiled. Count the project's address in the bundle; it must be 1 or more:

  ```bash
  unzip -p build.aab base/assets/index.android.bundle | LC_ALL=C grep -a -c "<project-ref>.supabase.co"
  unzip -p build.ipa 'Payload/*.app/main.jsbundle' | LC_ALL=C grep -a -c "<project-ref>.supabase.co"
  ```

  Keep `grep -a` on the pipe: `strings` on macOS cuts long lines and can report 0 for a bundle that has the address.
- **One place for each name.** When a name is in `eas.json` and also an EAS variable, EAS CLI says the `eas.json` value is used and prints a warning, but Expo does not document the order and the build machine joins the two itself. Do not depend on it: the guard stops a build whose switch differs from `eas.json`, and the rehearsal names anything set twice.
- **Never run `eas env:push` without `--path`.** It uploads `.env.local` by default, with its development-only keys and tokens. `eas env:pull` without `--path` overwrites `.env.local`.
- **Selling stays off.** The app opens its paywall only with a store key (`EXPO_PUBLIC_REVENUECAT_*`) and a privacy policy link (`EXPO_PUBLIC_PRIVACY_POLICY_URL`) built in, and the server's side of selling is already on. The first closed test sells nothing and plans are given from the Admin, so the guard stops a store build that carries any of the three. To start selling, take the names out of `notSoldYet` in `scripts/store-build-rules.mjs` in the commit that reviews the paywall, then set them as EAS variables.
- **Icons and launch screen.** The icons in `assets/` are provisional, a plain E: replace the files and keep their names. `assets/splash.png` is transparent on purpose. Expo SDK 55 only colours the iOS launch screen when it has an image. On Android 12 and later the system also draws the app icon in the middle of the launch screen.

`tests/store-build-config.test.ts` holds the reviewed answer for every `EXPO_PUBLIC_` name the app reads. A new name fails the tests until it has one.

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
