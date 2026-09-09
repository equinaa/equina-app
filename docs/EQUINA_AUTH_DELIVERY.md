# Equina Account Delivery

## Product flow

- Onboarding asks for rider context before account creation.
- The final preview offers email plus only the social providers explicitly enabled for that build.
- Email uses a secure magic link while the project relies on Supabase's default mailer.
- After custom SMTP and the token template are configured, email can switch to a six-digit one-time code.
- A password is optional in code mode and is set only after the code establishes an authenticated session.
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

1. Verify an Equina sending domain with an SMTP provider such as Resend.
2. Configure the provider under Supabase Auth SMTP settings. Keep its API key outside Expo and git.
3. Replace the magic-link template with the six-digit token template in
   `supabase/templates/magic_link.html`.
4. Set `EXPO_PUBLIC_EQUINA_EMAIL_AUTH_MODE=otp` and push the Supabase Auth config.
5. Test delivery, expiration, resend throttling, invalid codes, and account recovery with external addresses.

## Release gate

Do not advertise Apple or Google sign-in in a production build until each provider is enabled in Supabase and its full device matrix passes. Production email delivery requires custom SMTP; Supabase's default mailer is only a temporary development path.
