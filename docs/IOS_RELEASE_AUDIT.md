# Equina iOS Release Audit

Date: 2026-07-21

## Verdict

Equina is suitable for product demos and browser QA. The production backend is now
implemented in the repository, but it is not deployed or connected to the current
screen state. Equina is not ready for a public App Store release yet.

A signed iOS TestFlight showcase build is realistic within one week if EAS and Apple credentials are configured. A public production release with live accounts, horse records, Club posts, and Shop transactions is not realistic until the client-side mock services are replaced with a secured backend.

## Release Blockers

1. The app is wired to seeded in-memory data in `src/App.tsx`. Reloading loses user changes.
2. Supabase Auth, RLS, and client repositories exist, but onboarding has not been migrated from local state to email OTP.
3. Stripe Connect functions, signed webhooks, inspection, disputes, refunds, and delayed seller transfers exist, but Stripe credentials, tax adapter, legal approval, shipping coverage, and PaymentSheet UI are absent.
4. Club persistence, report, block, moderation, and Realtime contracts exist, but the existing Club UI has not been migrated or release-tested.
5. Account deletion requests exist, but the in-app account center and scheduled deletion/anonymization operation are incomplete.
6. Secure record persistence and upload tickets exist, but the existing Passport/Vet/Labs UI still uses local preview state.
7. EAS is not authenticated and the local machine does not have a complete Xcode installation selected.
8. Store assets and metadata are incomplete: app icon, adaptive icon foreground image, privacy policy URL, store screenshots, support URL, and privacy answers.
9. The repository has no initial commit yet, so there is no stable rollback baseline for release work.

## One-Week Delivery Target

Ship a private TestFlight MVP focused on the daily rider loop:

- onboarding;
- horse profile and records shell;
- ride logging and recap;
- Learn lessons;
- Assistant clearly labeled as guidance, not diagnosis;
- read-only Club and Shop showcase surfaces unless the production backend lands in time.

Do not enable public posting or transactional checkout in the first public build until backend authorization, persistence, moderation, and payment webhooks are complete.

## Seven-Day Sequence

1. Configure Expo/EAS, Apple Developer access, App Store Connect record, identifiers, credentials, icons, and first internal iOS build.
2. Add a real backend boundary, persistent database, secure authentication, environment handling, and server-side authorization.
3. Implement horse record persistence and file uploads. Add delete-account settings and privacy policy surfaces.
4. Either add Club report/block/moderation support or keep Club read-only for the first public build.
5. Keep Shop read-only or remove transaction claims until Stripe Connect or Adyen escrow behavior is implemented server-side with idempotent webhooks.
6. Run iPhone device QA for onboarding, keyboard, safe areas, scroll, image failures, offline states, and accessibility. Add UI regression tests.
7. Upload the signed build to TestFlight, complete metadata and privacy answers, then run a release-candidate pass.

## Android Follow-Up

Use the same EAS profiles for Android after iOS TestFlight stabilizes. Add the final adaptive icon, Play Console record, Android signing, `.aab` production build, and Android device QA.
