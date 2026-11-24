# Equina Account Delivery

## Product flow

- Onboarding asks for rider context before account creation.
- The final preview offers email plus only the social providers explicitly enabled for that build.
- Creating an account with a password sends a six-digit code; the account opens once the code is entered.
  Signing up again with an email that already has an account says so and points to sign-in.
- Signing in with the right password to an account that never confirmed its email sends a fresh code and
  asks for it, instead of reading like a wrong password. Auth only reports "not confirmed" after the
  password matched, so this reveals nothing to someone who does not know it.
- Signing in by email code and resetting a password answer the same way whether or not an account exists.
- Every email is a code, not a link (`EXPO_PUBLIC_EQUINA_EMAIL_AUTH_MODE=otp`), once the templates in
  `supabase/templates/` are the hosted ones; the email-change template still carries a link, and no app
  flow uses it. A code works on any device and cannot be used up by a mail scanner that opens links. Link
  mode (`magic-link`) stays only for the built-in mailer, until custom SMTP is live.
- Completing onboarding initializes the first ride plan, a zero-progress personalized Academy path, and Ralf's initial rider context.
- The one-time starter pack is persisted in `onboarding_starter_packs`; retries cannot issue a duplicate reward.

## Security contract

- Native sessions use `expo-secure-store` with `WHEN_UNLOCKED_THIS_DEVICE_ONLY`.
- Browser OAuth uses Authorization Code with PKCE.
- Native Apple authentication uses a SHA-256 nonce and validates OAuth state.
- Provider tokens, authorization codes, passwords, and email codes are never logged.
- Apple and Google client secrets belong in their provider consoles and Supabase Auth only. They must never use an `EXPO_PUBLIC_` variable.

## Apple setup

1. Enable Sign in with Apple for `com.equina.mobile` in Apple Developer.
2. Create the Services ID, Sign in with Apple key, and provider client secret.
3. Configure and enable the Apple provider in Supabase Auth.
4. Keep `ios.usesAppleSignIn` enabled in `app.json`.
5. Add `equina://auth/callback` to Supabase redirect URLs.
6. Test native Apple authentication on a physical iPhone before TestFlight submission.
7. Set `EXPO_PUBLIC_ENABLE_APPLE_AUTH=true` only in builds that passed the device test.

## Google setup

1. Create and verify Equina's OAuth consent brand in Google Auth Platform.
2. Create a Web OAuth client and use
   `https://mvdxohyayriywbcknulg.supabase.co/auth/v1/callback` as its authorized redirect URI.
3. Add the production web origin and `http://localhost:8081` while developing.
4. Configure and enable the Google provider in Supabase Auth.
5. Keep `equina://auth/callback`, localhost, and the production URL in Supabase redirect URLs.
6. Test account creation, returning-user sign-in, cancellation, and provider denial on iOS and Android.
7. Set `EXPO_PUBLIC_ENABLE_GOOGLE_AUTH=true` only after the matrix passes.

## Email delivery setup

The hosted project confirms emails (`mailer_autoconfirm: false`). Supabase's built-in mailer only delivers
to members of the Supabase organization, so until these steps are done nobody else can finish signing up.
Auth emails go out through Resend from the subdomain `auth.equina.ai`, which leaves the main domain's
website and Google mail untouched.

1. **Resend:** create the account, then Domains -> Add domain -> `auth.equina.ai`.
2. **Namecheap** (equina.ai -> Advanced DNS): add exactly the records Resend shows for that domain.
   Normally three, all under `auth`:
   - TXT `resend._domainkey.auth` (DKIM)
   - MX `send.auth` -> `feedback-smtp.<region>.amazonses.com`, priority 10
   - TXT `send.auth` -> `v=spf1 include:amazonses.com ~all`

   Then press Verify in Resend. Nothing else in the zone changes.
3. **Resend API key:** API Keys -> Create, permission "Sending access", domain `auth.equina.ai`. Paste it
   straight into Supabase in the next step; it never goes into git, Expo, or Vercel.
4. **Supabase SMTP:** Dashboard -> Authentication -> Emails -> SMTP Settings -> enable custom SMTP:
   sender `no-reply@auth.equina.ai`, name `Equina`, host `smtp.resend.com`, port `465`, username `resend`,
   password = the API key, minimum interval 60 seconds.
5. **Supabase rate limit:** Authentication -> Rate Limits -> emails sent per hour. Custom SMTP starts at 30;
   raise it for launch.
6. **Supabase templates:** Authentication -> Emails -> Templates. For each one, paste the subject from
   `supabase/config.toml` and the HTML from `supabase/templates/`:

   | Dashboard template | File |
   | --- | --- |
   | Confirm sign up | `confirmation.html` |
   | Magic link | `magic_link.html` |
   | Reset password | `recovery.html` |
   | Reauthentication | `reauthentication.html` |
   | Change email address | `email_change.html` |
7. **Switch the apps to codes,** right after step 6 (from then on the emails carry no link):
   - Vercel project `equina`: `EXPO_PUBLIC_EQUINA_EMAIL_AUTH_MODE=otp` for Production and Preview, then redeploy.
   - iOS and Android builds: already `otp` in `eas.json` (`preview` and `production`). Do not also set it as an EAS variable: a name lives in one place (README, "Store builds").
   - Local: the same line in `.env.local`, then restart Metro with `--clear`.
8. **Test with an address outside the Supabase organization** (a fresh Gmail):
   - create an account with a password -> code arrives from `auth.equina.ai` -> enter it -> onboarding;
   - create one and close the app before entering the code -> sign in with the password -> new code -> in;
   - wrong code, expired code, "Resend" after 60 seconds;
   - reset password by code -> choose a new one -> sign in with it;
   - sign in by email code;
   - create an account again with a used email -> "An account already exists".

## Release gate

Do not advertise Apple or Google sign-in in a production build until each provider is enabled in Supabase and its full device matrix passes. Production email delivery requires custom SMTP; Supabase's default mailer reaches only the Supabase organization's members.
