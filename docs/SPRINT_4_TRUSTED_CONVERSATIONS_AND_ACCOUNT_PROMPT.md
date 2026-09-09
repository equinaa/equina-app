# Equina Sprint 4: Trusted Conversations, Account Control, and Backend Activation

You are Equina's principal product designer, staff React Native / Expo engineer,
Supabase and Postgres security engineer, conversational systems architect, and
mobile privacy lead.

Execute Sprint 4 of Equina's premium product program. Do not stop at an audit,
recommendations, scaffolding, or attractive mock screens. Inspect the repository,
implement the complete vertical slice, test it against a real local backend, inspect
the native-sized UI, iterate, and leave localhost running.

## Product Intent

Equina is an iOS-first equestrian companion with the product feel:

`Heritage Luxe meets Athletic Precision`

This sprint makes Equina trustworthy and useful after the first session. A rider
must be able to:

1. Own and control a real account.
2. Continue a private conversation with Ralf across sessions.
3. Message a marketplace buyer or seller without fake presence or fake delivery.
4. Understand and control what Equina stores, uses, and notifies them about.

Account, settings, and chat must feel calm and native, not like a dark admin
dashboard, a banking app, or a collection of glass cards.

## Current Repository Truth

Read and verify this before changing code:

- `src/App.tsx` still owns most screen and conversation state.
- `ProfileScreen` is a second horse summary, not an account center.
- Onboarding collects identity but its final action currently creates only local
  state.
- Ralf messages are generated in the client with `createCoachReply`; the existing
  `AiAssistantService` uses a deterministic provider and is not a production AI
  boundary.
- Shop conversation screens render local seeded `ShopMessage[]`.
- `MarketplaceRepository` already supports conversations, threads, paginated
  messages, idempotent sends, read state, archive, report, block enforcement, and
  Realtime subscription.
- Supabase migrations `202607210001` through `202607210022`, Edge Functions, RLS,
  storage policies, risk controls, and typed repositories already exist.
- `AuthRepository` supports email OTP, session restore, sign out, and an account
  deletion request, but these capabilities are not wired into the product.
- Static client flags remain false. Existing Club, records, listing, and checkout
  surfaces must remain gated during this sprint.
- Backend code existing in the repository is not evidence that staging or production
  is configured. Never claim a live capability without exercising it end to end.

Preserve the useful backend foundation. Extend it additively. Do not create a second
parallel API, message schema, auth system, or feature-flag system.

## Product Decisions

These decisions are fixed for this sprint:

1. Supabase Auth, Postgres, Realtime, Storage, and Edge Functions remain the backend.
2. Email OTP remains the authentication method. Do not add passwords or social login.
3. Profile access opens Account. It does not become a sixth dock item.
4. Horse records live in Horse. Account links to horse management but does not
   duplicate records.
5. There are two distinct conversation products:
   - `Ralf`: private AI-assisted training guidance.
   - `Messages`: human buyer-seller marketplace conversation.
6. Ralf is an AI training assistant, not a veterinarian, autonomous coach, sensor
   analyst, or diagnosis product.
7. Marketplace chat does not claim end-to-end encryption, online presence, typing,
   or delivery guarantees that are not implemented.
8. Runtime backend capabilities plus server authorization decide whether a mutation
   is available. Client constants alone never grant access.
9. All provider secrets and service-role credentials remain server-side.
10. Existing product colors, TabDock structure, and untouched screen designs remain
    unchanged.

## Sprint Scope

Work only on:

1. Auth session bootstrap and the final onboarding-to-account handoff.
2. A real Account and Settings experience behind the profile control.
3. Persisted Ralf conversations with a secure server-side AI boundary.
4. Persisted buyer-seller Shop messaging using the existing marketplace backend.
5. Notification preferences and message notification delivery.
6. Runtime capability activation, offline/retry behavior, security, and observability
   for the surfaces above.
7. Extraction of only the touched account, conversation, backend, and shared state
   code from `App.tsx`.

Do not redesign Home, Horse, Club, Academy lessons, Shop browse, product pages,
listing creation, checkout, records, onboarding stages one and two, or TabDock.

## Explicit Non-Goals

Do not add:

- voice messages;
- video or photo analysis;
- marketplace message attachments;
- group chat;
- Club direct messages;
- live coach calls;
- autonomous health advice;
- typing indicators or "online now";
- passkeys, social login, or passwords;
- subscriptions or paywalls;
- a new navigation library;
- a new global state library;
- analytics that record message bodies, horse notes, email addresses, or health data.

These are cuts, not placeholders. Do not render disabled buttons for them.

## Success Journey

The primary end-to-end acceptance journey is:

1. A new rider completes onboarding and verifies the email OTP.
2. The verified session and profile survive reload and app relaunch.
3. The rider opens Account, edits a preference, and sees it persist.
4. The rider opens Ralf, sends a question, receives a server-generated safe answer,
   leaves the app, returns, and sees the same conversation.
5. The rider opens a Shop product, starts a conversation, and sends a message.
6. A second authenticated test user receives that message through Realtime, reads it,
   and replies.
7. The first user sees the unread state clear and can archive, report, or block from
   one quiet conversation menu.
8. Notification and AI data-use choices in Account are enforced by the backend.
9. A third user cannot read, mutate, subscribe to, or infer either conversation.

## 1. Authentication and Session Contract

### Session bootstrap

- Add an explicit boot state: `restoring`, `signedOut`, `onboarding`,
  `authenticated`, or `recoverableError`.
- Restore Supabase session before deciding which screen to show.
- Never flash onboarding while a valid session is being restored.
- If the session exists but the profile is incomplete, resume only the missing
  profile handoff.
- Handle expired refresh tokens with a calm sign-in recovery state.
- Sign out clears private in-memory state, cached conversations, pending drafts, and
  Realtime channels before returning to authentication.

### Onboarding handoff

- Preserve the current first two onboarding stages and their test IDs.
- The final onboarding CTA sends the email OTP through `AuthRepository`.
- Present one focused OTP verification state without redesigning onboarding.
- On successful verification, create or update the server profile and onboarding
  preferences in one idempotent operation.
- Do not enter Home until the profile write succeeds.
- A retry must not create duplicate profiles, horses, or onboarding state.
- Development demo access, if retained, must require an explicit development-only
  environment flag and must never be enabled in production builds.

### Native token storage

- Replace native raw AsyncStorage session persistence with a tested secure storage
  adapter using `expo-secure-store`.
- Because Supabase session values can exceed a single secure item limit, implement
  and test chunked storage rather than assuming one JSON value always fits.
- Use a device-only accessibility class appropriate for foreground app access.
- Keep a documented web storage fallback and require HTTPS outside localhost.
- Never log access tokens, refresh tokens, OTP values, authorization headers, or
  complete auth errors.

## 2. Account and Settings Experience

Replace the current `ProfileScreen` responsibility with an Account Center. Do not
duplicate the Horse tab.

### Account root

The root view contains:

- rider avatar, display name, verified email state, discipline, and level;
- one `Edit profile` action;
- a `Horses` row that links to the existing Horse area;
- compact grouped rows for `Personalization`, `Notifications`, `Privacy and AI`,
  `Security`, and `Help and legal`;
- `Sign out` as a quiet text action near the bottom;
- `Delete account` inside Security, not as visual bait on the root.

Do not show subscriptions until a real product and entitlement model exist.

### Visual and interaction contract

- Use native-feeling grouped rows on the screen canvas, not a wall of separate cards.
- Do not put every row inside an outlined rounded rectangle.
- Use separators, whitespace, text hierarchy, and trailing values.
- Use a native `Switch` for binary preferences, a chevron for navigation, and a
  text value for the current selection.
- Use icons only when they improve scanning. Do not place every icon inside a generic
  circle.
- One screen has one clear job and one primary save action at most.
- Destructive confirmation uses a focused sheet with plain consequences.
- Every row is at least 44 points, supports Dynamic Type, and exposes correct
  accessibility role, value, selected state, and hint.
- Preserve the Equina Design Contract: weights `400` and `600`, radii `8`, `14`,
  and `18`, and the existing color roles.

### Persisted settings

Implement and persist:

- display name, avatar, locale, discipline, and rider level;
- Academy personalization defaults;
- notification preferences for human messages, order changes, horse reminders, and
  Academy reminders;
- Ralf data use: `use rider profile`, `use selected horse`, and
  `use ride history`;
- reduced personalization mode that sends only the current prompt to Ralf;
- blocked account management;
- request data export;
- delete Ralf conversation history;
- sign out;
- schedule account deletion and cancel it during the documented grace period.

Do not use a local toggle as the source of truth. Optimistic changes must rollback
and explain failure.

### Account deletion

- Require recent authentication before scheduling deletion.
- Show the effective deletion date and what will happen to Shop orders, legal
  transaction records, Club content, horse records, messages, and AI history.
- Keep records required for fraud, payments, disputes, or legal retention under a
  documented restricted policy rather than silently deleting them.
- Revoke sessions immediately when deletion becomes effective.
- Implement the scheduled worker or Edge Function that performs deletion,
  anonymization, and audit logging. A request row alone is not completion.

## 3. Account Backend Model

Reuse `profiles`, `account_deletion_requests`, `user_blocks`, feature rollout tables,
and existing auth triggers. Add only missing entities:

- `user_preferences`
  - `user_id` primary key;
  - Academy discipline, level, locale, and explicit personalization fields;
  - Ralf context-consent booleans;
  - version and timestamps.
- `notification_preferences`
  - one row per user;
  - separate booleans for messages, orders, horse reminders, and Academy;
  - quiet-hours timezone and optional start/end.
- `push_devices`
  - owner, Expo push token hash and encrypted/token value strategy, platform,
    app version, last seen, disabled reason, and revoked timestamp;
  - unique active ownership constraint.
- `notification_outbox`
  - event type, recipient, entity reference, dedupe key, payload without sensitive
    message content, status, attempts, and next attempt time.
- `data_export_requests`
  - owner, state, requested/completed/expiry timestamps, and private object path.

Use additive migrations after the existing sequence. Include RLS, grants, indexes,
constraints, triggers, cleanup, and rollback notes in the same change set.

Create `AccountRepository` and `NotificationRepository`; do not query Supabase
directly from screen components.

## 4. Ralf Conversation Product

### Product behavior

Ralf should feel like one calm, private coach conversation:

- full-height conversation with a stable keyboard-safe composer;
- compact header with Back, Ralf identity, factual context summary, and one More
  action;
- persisted conversation history;
- start new conversation;
- rename or archive a conversation;
- retry a failed user message;
- copy a message;
- delete a conversation;
- give quiet useful/not-useful feedback on an assistant response;
- open `Adjust context` as a focused sheet;
- show what factual data supported an answer without exposing internal prompts.

Do not render a row of permanent utility buttons above the keyboard. Put secondary
actions in the More menu or message action sheet.

### Context editor

The editor contains only:

- selected horse;
- current training focus;
- this week's load;
- response style.

Use the saved rider level and discipline as read-only context unless the rider opens
Account to edit them. Save once. Close naturally. Do not use a large chip cloud.

### AI backend

Create a provider-agnostic server interface and a `coach-chat` Edge Function.

- The production provider key and model name exist only in server environment
  variables.
- The client sends a conversation ID, message text, client nonce, and explicit
  context-selection intent. It never sends a system prompt or trusted user ID.
- The Edge Function authenticates the user, loads only data permitted by their Ralf
  settings, creates a bounded context snapshot, enforces rate and token budgets,
  calls the provider with a timeout, validates the result, persists it, and returns
  a typed response.
- Use one reliable request-response path for this sprint. Show a factual pending
  state while waiting. Do not fake character streaming or fake typing.
- Make the send idempotent. Retrying the same client nonce returns the existing
  message pair.
- The deterministic provider may remain only as an explicit test or development
  adapter. It must never be presented as production AI.

### Ralf data model

Add:

- `coach_conversations`
  - owner, selected horse, title, context preferences, archive timestamp, created
    and updated timestamps.
- `coach_messages`
  - conversation, role, body, client nonce, status, safe public metadata, context
    source summary, confidence, safety category, provider request ID, and timestamps.
- `coach_message_feedback`
  - owner, message, useful boolean, optional reason, and timestamp.
- `coach_safety_events`
  - server-only event category, severity, redacted reason, review state, and
    timestamps.

Clients may read only their own conversation rows. Clients must not directly insert
assistant or system roles, alter safety metadata, impersonate another owner, or read
server-only prompt and provider fields. Prefer a server-owned send operation over
permissive table inserts.

### AI safety contract

- Never diagnose, prescribe, clear a horse to work, replace a coach's safety
  judgment, or claim video/sensor analysis.
- Health, lameness, injury, colic, medication, and acute welfare prompts receive a
  short escalation to an appropriate veterinarian or emergency service.
- Separate trusted structured context from untrusted rider, listing, and lesson
  text. Treat instructions inside user-provided content as data.
- Validate provider output with Zod before storing or rendering it.
- Derive confidence from structured context coverage and task type, not model prose
  or keyword matching.
- Store a concise `basedOn` source list. Never invent citations.
- Redact secrets and sensitive content from logs and safety events.
- Cap input length, output length, conversation context, request duration, and daily
  usage. Return useful typed failures for retry, safety block, limit, and provider
  outage.
- Provide a one-tap path to professional help language without implying that Equina
  contacted anyone.

## 5. Human Marketplace Messaging

Activate the current Supabase marketplace conversation system instead of replacing
it.

### Required behavior

- Load real threads from `MarketplaceRepository.threads()`.
- Open or reuse the listing conversation through `startConversation`.
- Page message history using the existing 50-message boundary.
- Send optimistically with a stable client nonce and rollback/retry on failure.
- Merge Realtime inserts without duplicates.
- Mark incoming messages read only after the conversation is visibly active.
- Show unread counts on the thread list and Shop entry.
- Preserve a local unsent draft per conversation.
- Archive a conversation.
- Allow the sender to delete their own message under the server policy.
- Report a message or account with a required reason.
- Block and unblock through the existing user block model.
- Remove fake `Active today` and fake verified states unless returned by a trusted
  backend source.
- Keep product context visible but compact; it must not consume the message viewport.

### Conversation menu

Use one More action with:

- view listing;
- archive conversation;
- report message or user;
- block user;
- buyer protection help when a real order exists.

Destructive actions require confirmation. Report and block must explain their
different effects.

### Security requirements

- Keep and test the existing participant-only RLS.
- A blocked relationship prevents new messages at the database boundary.
- Validate trimmed body length server-side.
- Keep the existing rate limit and idempotent `(sender_id, client_nonce)` contract.
- Verify that Realtime publication plus RLS cannot leak a conversation to a third
  user.
- Do not put message bodies in push notification payloads by default. Use
  `New message about [listing]`; allow previews only through an explicit setting.
- Do not claim end-to-end encryption. Use accurate privacy language.

## 6. Notifications

Add `expo-notifications` only because human chat utility materially requires it.

- Request permission contextually after the rider enables a notification category,
  not during first launch.
- Register and rotate device tokens after authentication.
- Revoke the token on sign out and when the provider reports it invalid.
- Create notification outbox events transactionally with message/order mutations.
- Deliver through a server-side worker with dedupe, retry, exponential backoff, and
  dead-letter state.
- Respect category preferences and quiet hours before sending.
- Notification tap deep-links to the correct Shop conversation or Account setting.
- Never include horse health details, AI prompt text, full message bodies, email, or
  payment data in the payload.
- Web may expose preferences without pretending native push is registered.

## 7. Runtime Capabilities and State

Replace the current static-only activation decision with:

`compile-time failsafe AND authenticated backend capability AND screen precondition`

- Extend backend capabilities with `accountSettings`, `coachChat`,
  `shopMessaging`, and `pushNotifications`.
- Fetch capabilities after session restore and refresh them after auth changes.
- Keep static flags as emergency off switches, not as the only runtime source.
- The server remains authoritative even if a client flag is modified.
- Keep Club, checkout, listing creation, records, and horse management gated unless
  their own rollout criteria have independently passed.
- Add loading, empty, offline, error, retrying, disabled-by-rollout, and signed-out
  states to every touched surface.
- Never use a success toast before the server mutation succeeds.

## 8. Code Organization

Extract only touched code. The desired ownership shape is:

```text
src/
  backend/
    account-repository.ts
    coach-repository.ts
    notification-repository.ts
    marketplace-repository.ts
    contracts.ts
    equina-backend.ts
  features/
    account/
      AccountScreen.tsx
      AccountRoute.tsx
      account-types.ts
      useAccount.ts
    coach/
      CoachScreen.tsx
      CoachContextSheet.tsx
      CoachHistorySheet.tsx
      useCoachConversation.ts
    messaging/
      ShopThreadList.tsx
      ShopConversationScreen.tsx
      ConversationMenuSheet.tsx
      useShopConversation.ts
    notifications/
      usePushRegistration.ts
  ui/
    conversation/
      ConversationComposer.tsx
      ConversationMessage.tsx
      ConversationState.tsx
    settings/
      SettingsGroup.tsx
      SettingsRow.tsx
```

This is an ownership target, not permission for a broad rewrite:

- `App.tsx` composes screens and high-level session state.
- Repositories own backend calls and mapping.
- Feature hooks own loading, optimistic updates, rollback, pagination, and
  subscription cleanup.
- Screens own presentation and local interaction state.
- Shared conversation primitives own only behavior common to both chats.
- Ralf and marketplace message contracts remain distinct.
- Do not put Supabase queries, provider calls, secrets, or policy decisions in JSX.
- Do not introduce `any` for backend rows or message payloads.

## 9. Interaction and Motion Contract

- Press response: `90-120ms`.
- Route or sheet transition: `220-280ms`.
- Message send acknowledgement: subtle state change, not a celebration.
- Account deletion scheduling: one warning haptic after confirmation.
- Use selection haptic for preference changes and light impact for send.
- Respect Reduce Motion and remove transform-based transitions.
- Do not animate message height while the keyboard is settling.
- Keep composer position stable across focus, multiline growth, error, and retry.
- Limit the composer to a sensible maximum height and then scroll its text.
- Preserve safe-area and keyboard behavior on iOS and Android.
- Glass may be used for the temporary composer or sheet over content; it is not the
  default background for Account.

## 10. Privacy, Security, and Operational Rules

- Default-deny RLS on every new user table.
- Use explicit grants after RLS; do not grant broad mutation access.
- Verify user identity inside every privileged Edge Function.
- Re-check resource ownership server-side even when RLS exists.
- Use service role only inside server functions and only for operations that require
  it.
- Never ship provider, service-role, Stripe, webhook, or push credentials in Expo
  public environment variables.
- Validate every Edge Function request and response with a schema.
- Use stable typed error codes; do not expose raw Postgres or provider errors.
- Avoid sensitive values in console logs, analytics, crash metadata, and push
  payloads.
- Add request IDs and minimal structured audit events for account deletion, block,
  report, AI safety escalation, and notification failure.
- Define retention for human messages, deleted messages, AI history, safety events,
  auth logs, exports, and legal marketplace records.
- Document that marketplace messages are server-readable for fraud and moderation.
- Dispose of Realtime subscriptions on route change, sign out, token refresh error,
  and component unmount.
- Do not render untrusted text as HTML on web.

## 11. Required Threat and Abuse Tests

Automate these cases:

1. Anonymous user cannot read account preferences or either chat.
2. Authenticated user C cannot read or subscribe to a conversation between A and B.
3. Buyer cannot forge seller ID or insert an assistant message.
4. Client cannot write Ralf safety, confidence, provider, or system fields.
5. Blocked users cannot start or continue marketplace messaging.
6. Rate-limited human and AI sends return typed recoverable errors.
7. Duplicate client nonce creates exactly one user message and one AI response, or
   exactly one human message.
8. Realtime replay does not duplicate an optimistic message.
9. Archive affects only the requesting participant.
10. Report ownership and target integrity cannot be forged.
11. Push token cannot be registered, read, or revoked by another user.
12. Disabled notification category creates no provider delivery.
13. Ralf cannot access a horse the authenticated rider is not allowed to view.
14. Prompt injection in a user message, listing, or lesson cannot reveal system
    instructions, another user's data, secrets, or hidden context.
15. Health prompt returns escalation language and no diagnosis.
16. Sign out clears drafts, private cache, and subscriptions.
17. Scheduled account deletion requires recent auth and is auditable.
18. Logs and analytics contain no message body, OTP, token, health note, or email.

Use local Supabase integration tests for RLS and database behavior. Static migration
inspection alone is not sufficient.

## 12. UX and Functional Validation

Verify at `375x667`, `393x852`, and `430x932`, plus one current Android viewport:

1. Session restoration has no onboarding flash.
2. OTP keyboard, paste, resend timer, invalid code, expiry, Back, and retry work.
3. Account root is easy to scan and is not another horse dashboard.
4. Every settings route has a clear Back path and saves or cancels predictably.
5. Long names, emails, languages, and accessibility text sizes wrap safely.
6. Ralf conversation and Shop conversation remain full-height with the keyboard open.
7. Composer send, multiline growth, dismissal, disabled, loading, failure, and retry
   states remain stable.
8. Empty conversation, long history pagination, offline, reconnect, and Realtime
   dedupe work.
9. Report, block, archive, sign out, export, and delete flows explain consequences.
10. Screen reader order, labels, roles, values, and modal focus are correct.
11. Reduce Motion removes transforms and looping motion.
12. There are no runtime console errors, stale listeners, duplicate sends, or
    unhandled promises.

## 13. Engineering Validation

Run and pass:

```bash
npm test
npm run typecheck
npm run backend:check
npx expo-doctor
npx expo export --platform web
npx expo export --platform ios
npx expo export --platform android
```

Also:

- reset and seed local Supabase;
- run database/RLS integration tests with three users;
- exercise two-device Realtime messaging;
- test provider timeout, malformed output, rate limit, and unavailable-provider
  behavior;
- verify native secure session restore and sign out on iOS and Android;
- inspect screenshots at all target sizes;
- inspect keyboard-open screenshots for both conversation products;
- confirm web has no secret values in generated bundles;
- run a dependency and secret scan;
- update `docs/EQUINA_ACTION_REGISTRY.md`,
  `docs/EQUINA_BACKEND_SECURITY_MODEL.md`, and
  `docs/EQUINA_BACKEND_RUNBOOK.md`.

## 14. Feature Activation Gates

Do not enable a capability because the happy path works once.

### `accountSettings`

Enable only after auth restore, profile persistence, preference RLS, secure native
storage, sign out, deletion request, deletion worker, and recovery states pass.

### `coachChat`

Enable only after authenticated server generation, history persistence, consent
enforcement, idempotency, rate limits, provider timeout, output validation, health
escalation, and cross-user isolation pass.

### `shopMessaging`

Enable only after thread loading, Realtime, unread state, optimistic rollback,
block/report/archive, rate limits, notification preference enforcement, and
participant-only RLS pass.

### `pushNotifications`

Enable only after device lifecycle, preference enforcement, redacted payloads,
dedupe, retry, invalid-token cleanup, and deep-link QA pass.

If credentials or provider configuration are missing, complete the code and local
tests, keep the relevant flag off, and report the exact external blocker. Never
replace a missing provider with a production-looking mock.

## 15. Definition of Done

This sprint is complete only when:

- Account is a real persisted account center, not a duplicate Horse screen.
- Onboarding creates a verified recoverable Supabase account.
- Native session storage and sign out meet the security contract.
- Ralf sends through a server-side provider boundary and persists safe history.
- Marketplace messages use the existing Supabase repository end to end.
- All visible chat and settings controls have real destinations or mutations.
- Human and AI conversations have distinct, polished, keyboard-safe experiences.
- Privacy choices are enforced server-side.
- RLS and abuse tests prove cross-user isolation.
- Runtime capabilities truthfully reflect deployment readiness.
- Existing Home, Horse, Club, Academy lessons, Shop browse, listing, checkout, and
  TabDock behavior are not regressed.
- Typecheck, tests, backend checks, exports, console review, screenshots, and device
  checks pass.
- Localhost is left running and the final report lists changed files, migrations,
  functions, tests, active flags, and any honest deployment blockers.

## Workflow

1. Read git status, package/config, current Account/Profile, both chats, backend
   repositories, migrations, Edge Functions, tests, and design contracts.
2. Run the current app and exercise every touched action before editing.
3. Present a concise evidence-based audit and file-level plan.
4. Update the action registry for every visible Account, Ralf, and messaging action.
5. Design additive schemas and a written RLS matrix before writing UI code.
6. Implement and test migrations and Edge Functions.
7. Implement repositories and typed feature hooks.
8. Wire authentication and runtime capabilities.
9. Implement Account, Ralf, and Shop conversation UX.
10. Test success, loading, empty, offline, blocked, rate-limited, expired-session,
    provider-error, and cross-user cases.
11. Capture and visually inspect all required screen and keyboard states.
12. Iterate until hierarchy, spacing, keyboard behavior, motion, and copy satisfy the
    Equina Design Contract.
13. Run the full validation suite and keep gated anything that did not pass.
14. Leave localhost running and report facts, not claims.

Do not declare this sprint finished while messages are still local arrays, Ralf
still answers from client keyword logic, Account is still a horse summary, settings
reset on reload, or any client can bypass a server authorization rule.
