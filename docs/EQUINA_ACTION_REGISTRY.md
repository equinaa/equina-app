# Equina Action Registry

Updated for Sprint 4. This document is the release truth for the current client.
An action may look finished only when its status and production boundary below are
accurate.

## Status Legend

- `real`: complete client behavior with an honest outcome.
- `local prototype`: works only in memory and resets on reload.
- `read-only`: navigation or inspection works; mutation is intentionally unavailable.
- `blocked by backend`: requires authenticated persistence or a provider boundary.
- `backend implemented / rollout gated`: server contract exists, but deployment,
  provider credentials, client journey, or release QA still blocks the live action.
- `unsafe claim`: must not be exposed as a production action.
- `dead`: code exists but is not reachable from the current interface.

## Route Inventory

| Area | Route or state | Primary job | Current status |
| --- | --- | --- | --- |
| Onboarding | You | Capture rider identity, discipline, and level | real client step |
| Onboarding | Your Horse | Capture photo, name, and optional breed | real client step |
| Onboarding | Your Equina | Preview, send email OTP, and complete one idempotent account handoff | backend implemented / rollout gated |
| Authentication | Email OTP | Verify a Supabase session without passwords | backend implemented / deployment gated |
| Account | Root | Inspect identity and open grouped account settings | real client; connected persistence gated |
| Account | Profile/Training profile | Edit rider identity; discipline, level and focus for Academy and Ralf | backend implemented / rollout gated |
| Account | Notifications | Persist category choices and contextually register native push | backend implemented / rollout gated |
| Account | Privacy and Ralf | Control Ralf context, export data, and clear AI history | backend implemented / rollout gated |
| Account | Security | Manage blocks and schedule/cancel account deletion | backend implemented / rollout gated |
| Home | Briefing | Show one suggested ride and factual journal context | local prototype |
| Home | Ride mode | Run a three-phase timer | local prototype |
| Home | Ride recap | Show elapsed time, phases, discipline, and rider check-in | local prototype |
| Horse | Overview | Inspect horse identity, latest ride, care, and sample records | read-only/local prototype |
| Horse | Nutrition | Preview a demo stable plan and local check-offs | local prototype |
| Horse | Health | Inspect sample health records and open Ralf | read-only |
| Horse | Docs | Inspect sample document state | read-only |
| Academy | For You | Inspect one personalized lesson path | published catalogue for connected accounts; preview catalogue in demo |
| Academy | Lessons | Search and filter lessons | published catalogue for connected accounts; preview catalogue in demo |
| Academy | Lesson | Play a lesson through a signed, expiring link and save the rider's place | backend implemented / video host gated (`academy-playback`, Mux); demo plays a bundled clip |
| Academy | Coach | Persist a private Ralf conversation through a server provider boundary | backend implemented / rollout gated; explicit dev demo adapter |
| Admin | Lessons | Create, edit, chapter, upload the video, publish and unpublish Academy lessons | built in `admin/`; needs a staff account with a second factor and the Mux secrets |
| Admin | Moderation | Restore or remove Club posts and comments that riders reported or the filter hid | built in `admin/`; needs a staff account with a second factor |
| Club | Feed | Inspect seeded social content | read-only |
| Shop buyer | Browse | Search, filter, save, and inspect seeded listings | local prototype/read-only |
| Shop buyer | Product | Inspect photos, metadata, and preliminary fit inputs | read-only |
| Shop buyer | Checkout | Explain the planned checkout boundary | read-only |
| Shop buyer | Orders | Inspect sample order states | read-only |
| Shop buyer | Saved | Inspect locally saved products | local prototype |
| Shop buyer | Messages | Load private threads, unread state, Realtime, drafts, report/block/archive | backend implemented / rollout gated |
| Shop buyer | Fit | Explain available and missing measurements | real client calculation/read-only |
| Shop buyer | Protection | Explain the planned protection workflow | read-only |
| Shop seller | Dashboard | Inspect sample seller data | read-only |
| Shop seller | Orders/Revenue | Inspect sample commercial states | read-only |
| Shop seller | Messages | Use the same participant-authorized human messaging product | backend implemented / rollout gated |
| Shop seller | Listing | Inspect seeded listing details | read-only |
| Profile | Account Center | Control rider identity, personalization, privacy, security, and sign-out | real client; connected persistence gated |

## State And Metric Inventory

| State or metric | Source | Durability | User-facing rule |
| --- | --- | --- | --- |
| Rider/horse onboarding answers | React state until OTP | draft only | Server profile and one primary horse are written only after OTP |
| Auth session | Supabase Auth | SecureStore chunks on native; Supabase web storage | restore before route decision; never log tokens |
| Account preferences | Postgres or labelled dev demo store | durable | optimistic UI rolls back on server failure |
| Active tab and nested route | React state | session only | Safe to present as navigation |
| Ride timer | device timer | recap only | Show elapsed time, never training quality |
| Completed ride phases | rider actions | recap only | Factual count |
| Horse-feel check-in | rider selection | recap only | Attribute to the rider; never infer it |
| Ride count | seeded React state | reload resets | Call it journal entries, not weekly performance |
| Academy progress | Postgres (`academy_progress`) for connected accounts; React state in demo | durable when `academy_progress` is on; session only otherwise | Finishing is recorded by the player or "Complete lesson", never inferred from a position |
| Ralf conversations | Postgres/Realtime | durable for connected accounts | server generates assistant role; dev demo is explicitly local |
| Ralf confidence | server-derived context coverage | message metadata | never trust model prose as confidence |
| Marketplace messages | Postgres/Realtime | durable | drafts only are local; bodies are server-readable for moderation |
| Push device | server-only table | until revoke/invalid token | token is never readable through the mobile Data API |
| Nutrition quantities | fixed demo fixture | reload resets | Always name `demo stable plan` as source |
| Nutrition check-offs/water | React state | reload resets | Preview log only |
| Record counts | seed data | reload resets | Label as sample while record persistence is disabled |
| Club likes/comments | seed counters | reload resets | Read-only sample counts |
| Saved shop items | React state | reload resets | Local prototype |
| Orders/revenue | seeded in-memory store | reload resets | Sample data, never live commerce |
| Saddle fit | structured metadata presence | computed | Qualitative screening only; no percentage |
| Weekly rhythm | invented progress | removed | Must not return without a validated data source |
| Recap rhythm score | invented progress | removed | Must not return without sensors or annotated observations |

## Action Registry

### Sprint 4 Account, Ralf, And Messages

| Action | Preconditions | Server destination | Recovery and truth | Status |
| --- | --- | --- | --- | --- |
| Restore session | configured backend | Supabase Auth + Account snapshot + capabilities | recovery screen; never flash onboarding | implemented; native device QA required |
| Send OTP | valid email and final onboarding step | Supabase Auth email OTP | focused error, resend cooldown, Back | implemented / deployment gated |
| Verify OTP | valid unexpired code | Supabase Auth session | invalid/expired error and resend | implemented / deployment gated |
| Complete account handoff | verified session | `complete_equina_onboarding` | retry reuses profile and primary horse | tested in PGlite |
| Edit profile/avatar | authenticated account capability | `profiles` + private avatar Storage | optimistic rollback/error | implemented / rollout gated |
| Save personalization | authenticated account capability | `user_preferences` | server result replaces optimistic state | implemented / rollout gated |
| Change notification category | authenticated account capability | `notification_preferences` | rollback on persistence error | implemented / rollout gated |
| Enable human-message push | saved preference, native device, push capability | permission prompt then `register-push-device` | denied/error remains factual; web does not claim registration | implemented / device and credential gated |
| Export account data | recent authenticated session | `request-data-export` + private Storage | retry; signed link expires | implemented / rollout gated |
| Clear Ralf history | confirmation | server delete RPC | error preserves history | implemented / rollout gated |
| Schedule/cancel deletion | connected account; explicit confirmation | deletion Edge Functions + audit | 14-day grace period; cancel before effective date | implemented / worker deployment gated |
| Sign out | active session or dev demo | revoke push, global sign-out, clear drafts/cache/channels | returns to onboarding/sign-in | implemented |
| Send Ralf message | connected coach capability or explicit dev demo | `coach-chat` Edge Function | stable nonce, pending, failed retry, provider typed errors | implemented / provider and rollout gated |
| Adjust Ralf context | conversation open | `update_coach_conversation` | one save; profile level/discipline remain Account-owned | implemented |
| Ralf history/new/rename/archive/delete | owned conversation | Coach repository/RPC | ownership and confirmation enforced | implemented; demo supports current local thread only |
| Ralf copy/feedback/sources | assistant message | clipboard / `coach_message_feedback` | sources are factual labels, not internal prompts | implemented |
| Open Shop thread | authenticated messaging capability | `threads` / `messages` | loading, empty, retry, unread clear | implemented / rollout gated |
| Start listing conversation | active backend listing, buyer is not seller | `create_marketplace_conversation` | open/reuse; typed error if blocked/ineligible | implemented / rollout gated |
| Send human message | active participant relationship | `marketplace_messages` | optimistic nonce merge, draft preservation, retry | implemented / rollout gated |
| Earlier human messages | active conversation | 50-message cursor page | retry leaves current history intact | implemented |
| Archive/report/block/delete own message | active participant | Marketplace and block repositories | reason required; consequences confirmed | implemented / rollout gated |
| Notification tap | registered native device | local deep link to Shop conversation ID | no message body in payload | implemented / device QA gated |

| Action | Preconditions | Destination or mutation | Persisted entity | Feedback | Failure recovery | Status / test |
| --- | --- | --- | --- | --- | --- | --- |
| Use demo profile | none | enter seeded Home | none | Home appears | reload onboarding | local prototype / visual fixture |
| Onboarding fields | valid text/selection | update draft answers | none | immediate selection | edit before completion | local prototype / onboarding tests |
| Pick horse photo | media permission for library | update draft URI | none | image/fallback/error copy | retry or starter image | local prototype / manual permission QA |
| Complete onboarding | valid five answers + verified email | idempotent server handoff, then Home | Profile/Preferences/Horse | OTP and continuity transition | resend/retry without duplicate horse | backend implemented / migration tests |
| Change top-level tab | app ready | switch tab | none | 240ms transition + selection haptic | tap previous tab | real / visual fixtures |
| Open profile | app ready | profile route | none | route change | dock returns to a tab | real / UI QA |
| Start ride | no active ride | Ride mode | none | haptic and timer | exit without saving | local prototype / ride tests |
| Advance ride phase | active ride | next phase | none | phase copy and progress | previous phase is not editable | local prototype / ride tests |
| Pause/resume ride | active ride | timer state | none | timer state changes | tap again | local prototype / ride tests |
| Finish ride | final phase | factual recap | none | success haptic | Home action | local prototype / ride tests |
| Change horse-feel check-in | recap visible | update rider-entered mood | none | selection haptic and copy | choose another option | local prototype / ride tests |
| Open recap lesson | recap visible | Academy lesson | none | route transition | Back to Lessons/Home | real navigation / UI QA |
| View Club from recap/Home | recap or Home visible | read-only Club | none | route transition | dock/Home | real navigation / UI QA |
| Share ride to Club | authenticated social backend | create post | CommunityPost | pending/success/error | retry/edit/delete | backend implemented / rollout gated by client + moderation QA |
| Home care action | Home visible | local care flag | none | factual session status | reload resets | local prototype / flagged for Sprint 1 persistence |
| Switch Horse section | Horse visible | Overview/Nutrition/Health/Docs | none | 240ms transition | select Overview | real navigation / UI QA |
| Open Passport/Vet/Labs | secure account and record backend | record flow | HorseRecord/File | loading/success/error | cancel/retry/edit/delete | backend implemented / rollout gated by client forms + deployment |
| Toggle demo meal | Nutrition visible | local checkbox | none | checked state | tap again | local prototype / labelled demo source |
| Log demo water | Nutrition visible | local quantity | none | local total | reload resets | local prototype / labelled demo source |
| Search Academy | Lessons visible | filter seeded lessons | none | result/empty state | clear search | real client behavior / UI QA |
| Filter Academy topic | Lessons visible | filter seeded lessons | none | selected state | choose All | real client behavior / UI QA |
| Open lesson | lesson exists | Lesson route | none | video loading/fallback | Back to Lessons | real navigation / UI QA |
| Play lesson | network and media available | video player state | none | native player state | retry/back | real media preview / manual media QA |
| Complete lesson | lesson open | local progress and next lesson | none | success haptic | reopen lesson | local prototype / Sprint 3 persistence |
| Configure Ralf context | Academy Coach visible | update owned conversation context | CoachConversation | selection feedback | retry/save once | backend implemented / rollout gated |
| Send Ralf prompt | nonempty prompt + capability | authenticated server provider boundary | CoachMessage | factual pending/response/safety escalation | stable-nonce retry | backend implemented / Edge + RLS tests |
| Club compose/photo/story | authenticated social backend | compose/media/story route | CommunityPost/Media | loading/success/error | retry/draft/delete | backend implemented / rollout gated by client journeys |
| Club like/comment/share | authenticated social backend | persisted interaction | Reaction/Comment | optimistic state + rollback | retry/report/block | backend implemented / rollout gated by client journeys |
| Search/filter Shop | Browse visible | filter seeded listings | none | result/empty state | clear filters | real client behavior / UI QA |
| Save/unsave product | product exists | local saved list | none | haptic/status | tap again | local prototype / Sprint 5 persistence |
| Open product/gallery | listing exists | Product route/gallery | none | route/media state | Back to Browse | real navigation / UI QA |
| Open fit screening | product exists | qualitative fit route | none | missing-data explanation | add data in future Horse flow | real calculation / product-truth tests |
| Ask Ralf about listing | product exists | Academy Coach context | none | deterministic guidance | Back/edit question | local prototype / safety tests |
| Preview checkout | active seeded listing | read-only checkout route | none | explicit preview copy | Back to Product | read-only / visual fixture |
| Confirm purchase | payment, shipping, tax, auth, webhooks | create protected order | Order/Payment | loading/success/error | idempotent retry/support | backend implemented / gated by Stripe, tax adapter, legal sign-off, PaymentSheet UI |
| Accept item/release funds | live inspection order | release provider funds | Order/Payment | confirmation/success/error | support escalation | backend implemented / rollout gated |
| Open dispute | live inspection order + evidence | dispute workflow | Dispute/Files | draft/submitted/error | edit/retry/support | backend implemented / rollout gated by client journey |
| Open seller dashboard | Shop visible | sample seller routes | none | route change | switch to Buy | read-only |
| Create listing | verified seller + uploads + moderation | listing draft flow | Listing/Files | draft/progress/error | save/retry/delete | backend implemented / rollout gated by client listing flow |
| Open message thread | authenticated participant | persisted conversation | MarketplaceConversation | route + unread clear | retry/back | backend implemented / rollout gated |
| Send buyer/seller message | authenticated participant + messaging capability | idempotent message insert | MarketplaceMessage | pending/sent/error | local draft + same-nonce retry | backend implemented / RLS tests |
| Add horse | authenticated profile backend | horse creation flow | Horse | draft/success/error | edit/archive/retry | backend implemented / rollout gated by client forms |

## Production Claim Registry

| Claim | Current truth | Rule |
| --- | --- | --- |
| Account created | real only after email OTP and idempotent server handoff | Dev demo remains explicitly labelled and is never a production account |
| Account deletion scheduled | real only through the audited Edge Function with a 14-day grace period; `erase_account_data` removes every table holding rider data | Direct Data API insert/update is revoked; worker and audit schedule must be live |
| Passport/lab uploaded | no file picker or signed upload | Disable mutation and label sample state |
| Ralf Coach | server-side AI training assistant boundary; production provider not configured here | Keep `coachChat` off until provider, consent, timeout, and device QA pass |
| High confidence | derived only from structured context coverage | Never accept confidence from provider prose |
| Marketplace message privacy | TLS + participant RLS; server-readable for fraud/moderation | Never claim end-to-end encryption, online presence, typing, or delivery guarantees |
| Push preview | `New message about [listing]`, with route and conversation ID | Never include message, horse health, AI prompt, email, or payment data |
| Social post live | backend exists but is not deployed or connected to the composer | Club stays read-only until provider moderation and end-to-end QA pass |
| Protected purchase | backend exists but Stripe, tax, legal, and PaymentSheet rollout are incomplete | Checkout remains a preview |
| Seller payment released | Stripe transfer code exists but is not deployed/configured | Keep order actions read-only until provider and end-to-end QA pass |
| Seller listing live | backend exists but seller onboarding, provider moderation, and client flow are not connected | Listing CTA stays disabled |
| Horse fit percentage | arbitrary listing score | Removed; use qualitative missing-data screening |
| Nutrition recommendation | fixed demo quantities | Name demo source and professional review boundary |

## Release Gate

Changing a compile-time or database flag to `true` requires the persisted entity,
server authorization, loading/error/retry behavior, duplicate protection, privacy
review, provider/worker configuration, and the matching automated and device
journey. The effective rule is `compile-time failsafe AND authenticated backend
capability AND screen precondition`; a visual implementation alone never satisfies
the gate.
