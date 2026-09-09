# Equina Sprint 6 Backend Activation

Execution date: 2026-07-29

## Result

The backend foundation moved from approximately **5.5/10 to 7.3/10**. Hosted
production readiness moved from approximately **3.8/10 to 5.9/10**.

The requested 8/10 production foundation is **not yet proven**. The remaining gap
is not hidden code volume: it is custom SMTP and CAPTCHA, compromised-key rotation,
native/provider tests, a separate staging project, scanner/metadata processing,
multi-user hosted isolation, and monitoring/alerts.

## Delivered

- Real Supabase Horse CRUD, primary horse selection, archive, and session reload.
- Real Horse Records CRUD for passport, vet, lab, vaccination, dental, farrier,
  nutrition, care, and notes.
- Private image/PDF upload through ticket, signed upload, completion, and cleanup.
- Loading, empty, offline, retry, validation, permission, and rollback states.
- Email/password sign-up, password sign-in, recovery request, recovery callback,
  password update gate, and global sign-out plumbing.
- Generation-safe native session storage with atomic manifest swap, stale cleanup,
  legacy migration, and failure-injection coverage.
- Recovery redirects for web, iOS/Android scheme, and the deployed web domain.
- Supabase secure password change is enabled; an old session cannot silently
  bypass reauthentication for a future password-change flow.
- Public Shop catalog reads no longer depend on messaging and never fall back to
  seed products in connected production mode.
- Named-user database overrides with default-off global rollout.
- Atomic claims and recoverable leases for Storage cleanup, moderation,
  notifications, account deletion, and export cleanup.
- Request IDs, stable redacted errors, and an optional server-only Sentry boundary.
- Malware scanner adapter boundary and explicit metadata-processing launch gate.

## Remote State

- 34 additive migrations are synchronized.
- Six functions are active: capabilities, four Horse/Records upload/delete
  boundaries, and Storage cleanup.
- Storage cleanup runs every five minutes with its own Vault/Edge secret.
- One internal user has Horse and Records overrides for 30 days.
- The current client is deployed to `https://equina-ten.vercel.app` with only
  publishable Supabase configuration; its production bundle has no server-secret
  marker.
- Club, messaging, listing creation, Ralf, push, account operations, and checkout
  remain off.

See `docs/EQUINA_BACKEND_DEPLOYMENT_INVENTORY.md` for exact function versions and
rollback commands.

## Automated Evidence

Passed:

```text
npm test
npm run typecheck
npm run backend:check
npm run backend:audit
npx expo-doctor
npm run build
npm run security:bundle-scan
npx supabase db lint --linked --schema public
npx supabase db push --linked --dry-run
```

The isolated Postgres suite proves named-user rollout isolation, cross-user horse
isolation, viewer/editor rules, blocked direct media registration, worker
concurrency, stale-lease recovery, and stale-token rejection.

Remote anonymous negative tests returned:

- direct private Storage upload: denied by RLS;
- direct `horse_record_files` insert: denied by table privileges;
- anonymous private signed URL: denied.

The remote Storage worker returned HTTP 200 with zero failures. The client bundle
scanner found no server secret in the exported web artifacts.

## Manual Tests Actually Performed

On localhost web:

- three onboarding stages and all back actions;
- rider-without-a-horse path;
- magic-link, password account creation, password sign-in, and recovery forms;
- social buttons correctly hidden;
- no runtime console errors.

Production web was also loaded after deployment and produced no runtime error. The
only warning is Expo Notifications' documented web listener limitation.

Not performed and therefore not passed:

- real email delivery/verification or recovery mail;
- authenticated Horse → Record → upload → browser/app restart;
- Rider A/Rider B/unauthorized Rider C against the hosted project;
- physical iOS or Android session restore;
- two-device Realtime/offline/reconnect;
- Apple or Google provider sign-in.

## External Blockers

1. Rotate/revoke the Supabase secret previously shared outside the secret manager
   and review access logs.
2. Provision a separate staging Supabase project and CI promotion path.
3. Authenticate EAS CLI and audit/set the native build environment; local EAS
   configuration is clean, but remote EAS variables were not observable.
4. Configure custom SMTP, SPF/DKIM/DMARC, templates, CAPTCHA/Turnstile, leaked
   password protection, and rate-limit monitoring.
5. Configure and test Apple and Google on physical devices before exposing buttons.
6. Provision Sentry/alerts and the malware/image-processing providers.
7. Run the hosted three-user and two-device matrix with consented QA accounts.
8. Replace remaining Club, seller draft, and messaging mock dependencies before
   their capability flags can move.
9. Keep checkout disabled until
   `docs/EQUINA_CHECKOUT_ACTIVATION_CHECKLIST.md` is fully approved.

## Immediate Rollback

Clear the named Horse/Records overrides and set both internal client switches to
false. Stop the Storage cron if cleanup invariants fail. Preserve database rows and
queues, rotate the affected secret, deploy an additive fix, and rerun all isolation
tests before restoring one internal user.
