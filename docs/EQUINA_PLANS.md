# Equina Plans

Ilinca's monetization draft ("Equina dev plan", Part 4) defines three tiers. Riders see them as
**Free**, **Plus** (her "Mid") and **Premium**. The database keys stay `free`, `mid` and
`premium`, the keys `coach_credit_policies` already used, so a plan's name is one row in the admin.

## What each plan holds

| | Free | Plus | Premium |
| --- | --- | --- | --- |
| Horse records and ride journal | yes | yes | yes |
| Academy | free lessons + 2 paid picks | free lessons + 30 paid picks | every lesson |
| Club | no | read and post | read and post |
| Ralf credits a month | 15 | 100 | 300 |
| 1-on-1 coach sessions | 0 | 1 | 2 |
| Ticket to the annual event | 0 | 0 | 1 |
| Free trial | none | 7 days | 7 days |

Every number is a row in `plan_tiers` (Ralf's credits in `coach_credit_policies`), changed from
Admin → Plans with no migration or release.

- **Picks.** A lesson filed as free in the admin is open to every signed-in rider. A paid lesson
  opens on Premium, or when the rider picks it. A pick is permanent (otherwise two picks would
  open every lesson in turn) and the app asks for a second tap that says so. After a downgrade the
  earliest picks stay open, as many as the new plan allows. A pick of a lesson that was later
  unpublished or made free stops counting.
- **Club.** `none`, `read` or `post`. Free has no Club, as the draft says; the tab stays and says
  what is inside. Switching Free to `read` (feed without writing) is one change in the admin.
  Riders always see their own posts, so they can take one down, and reporting stays open to
  everyone who can see a post.
  - **Groups.** The Club's Groups tab lists the seven public spaces. Joining one marks it as
    the rider's own: it gets a chip in the feed and its posts gather under "My groups". It opens
    nothing new, since every public space is readable by anyone with Club access, and leaving is
    one tap. Joining needs `post` access (the membership policies say so); `read` riders see the
    groups without a Join button. Member counts are not shown yet: the app only prints "Last post
    2h ago" from posts it has already loaded, never a number it cannot back. A photo on a post goes
    through the same upload tickets as every other file (type and size checked, content signature
    verified, malware scan when configured) and re-queues the post for provider moderation.
- **Ralf.** One credit is one message, three with a photo. Credits are only spent while the
  `coach_credits` flag is on; the allowance always follows the plan the rider holds. Premium's
  draft says "full access"; 300 a month (about EUR 1.60 at full use) keeps the cost bounded.
- **Sessions and the event ticket** are shown on the plan screen. Until there is a booking flow the
  Equina team arranges them with the rider by hand.
- **Not in the plans yet:** Course Generator credits (the feature does not exist) and the
  marketplace (on standby in Part 2; the draft says Free has no access).

## Where it lives

| Piece | What it is |
| --- | --- |
| `plan_tiers` | What each plan holds. Readable by anyone, so the plan screen renders before sign-up. |
| `plan_subscriptions` | Who holds a paid plan: one row per rider per source (`staff`, `app_store`, `play`, `stripe`). The highest-ranked live one applies, so a plan staff gave and one bought in the store never overwrite each other. A plan lapses at `ends_at`, with nothing running at that moment. |
| `academy_lesson_picks` | The paid lessons each rider chose. Written only by `pick_academy_lesson`. |
| `my_plan()` | Everything the app needs in one call: the plan, whether it is applied, picks, Club access, all three plans, and `access`: whether the account is through the beta door. |
| `academy_playback_source` | Refuses a locked lesson with PT402; `academy-playback` turns that into 402 `lesson_locked`. An account outside the beta is refused first, with PT403 (403 `beta_only`). |
| Club policies | Restrictive policies on posts, comments, reactions, media and memberships, through `private.club_access()`. |
| `private.ensure_free_coach_credits` | Grants the monthly allowance of the rider's plan, from the day the plan started. |
| `staff_update_plan_tier`, `staff_set_plan`, `staff_list_plans` | The admin's Plans page. Admin role with a second factor. |

## The founding phase and the `plans` flag

`plans` is off by default. While it is off every signed-in rider has every lesson and the whole
Club, and the plan screen says so; the plans only decide Ralf's monthly allowance.

"Every signed-in rider" means every rider through the beta door
(`docs/EQUINA_FEATURE_FLAG_POLICY.md`). An account outside it gets no flag at all, `plans`
included: no lesson plays, `pick_academy_lesson` refuses it, its Club access is `none`, and
`my_plan()` answers `access: false`, so the app offers it neither plans nor picks and nothing is
sold to it. Once `plans` is on globally, plans apply to every beta member, and to everyone once
`public_access` opens.

To try Free on one account before anyone else, turn the flag on for that account only:

```sql
insert into public.feature_flag_overrides(user_id, key, enabled, note)
select id, 'plans', true, 'Trying the Free experience' from auth.users where email = 'tester@example.com'
on conflict (user_id, key) do update set enabled = true;
```

Turn it on for everyone once riders can subscribe in the app.

## Giving a plan

Admin → Plans → Give a plan: the rider's email, Plus or Premium, an optional end date and a note.
It applies at once. Choosing Free takes back the plan staff gave; a plan bought in the store is the
store's to end. Testers, coaches and Ilinca's own account are given plans this way.

## Selling, through RevenueCat

RevenueCat project **Equina** holds the catalogue:

| | Identifier |
| --- | --- |
| Entitlements | `plus` (tier `mid`), `premium` (tier `premium`) |
| Products | `equina.plus.monthly`, `equina.plus.annual`, `equina.premium.monthly`, `equina.premium.annual`, each with a 7-day free trial |
| Offering | `default` (current): packages `plus_monthly`, `plus_annual`, `premium_monthly`, `premium_annual` |

Today the products exist only in RevenueCat's **Test Store**, with placeholder prices (USD 4.99 /
49.99 / 9.99 / 99.99). The App Store products must use the same identifiers.

How a purchase reaches the plan:

1. The app configures RevenueCat with the rider's Supabase id, sells from the `default` offering
   and, after a purchase or restore, calls `sync-purchases`.
2. `sync-purchases` and `revenuecat-webhook` both read the rider's whole customer from RevenueCat
   (`GET /v1/subscribers/{id}`) and rewrite their store rows in `plan_subscriptions`. A repeated,
   late or out-of-order event therefore changes nothing. Rows from `staff` are never touched.
3. `my_plan()` then reports the plan, and the limits follow.

The paywall shows only when **all** of these hold: a signed-in rider on iOS or Android (never web
or the demo), the platform's RevenueCat key, a privacy policy URL, `capabilities.purchases`
(both server secrets set, `plans` on for that rider and the rider through the beta door),
`my_plan().enforced` and `my_plan().access`.

### Configuration

| Where | Name | Value |
| --- | --- | --- |
| App env (EAS / `.env.local`) | `EXPO_PUBLIC_REVENUECAT_IOS_API_KEY` | `appl_...` for real builds; the Test Store `test_...` key **only** in development builds (it crashes release and TestFlight builds on purpose) |
| App env | `EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY` | `goog_...`, once Android is set up |
| App env | `EXPO_PUBLIC_PRIVACY_POLICY_URL` | the public privacy policy page; required to sell |
| App env | `EXPO_PUBLIC_TERMS_URL` | optional; empty uses Apple's standard EULA |
| Supabase secrets | `REVENUECAT_SECRET_API_KEY` | a **v1** secret key from RevenueCat → API keys |
| Supabase secrets | `REVENUECAT_WEBHOOK_AUTHORIZATION` | e.g. `Bearer <long random string>`, typed identically on the webhook |
| Supabase secrets | `REVENUECAT_ACCEPT_TEST_STORE` | `true` only while testing with the Test Store; **false at launch** |
| RevenueCat → Integrations → Webhooks | URL | `https://mvdxohyayriywbcknulg.supabase.co/functions/v1/revenuecat-webhook`, environment **both** (App Review buys in the sandbox) |

### Testing

- **Test Store (now):** a development build with the `test_` key. Buying shows RevenueCat's own
  sheet with success, failure and cancel. A test month renews every 5 minutes and ends after 25; a
  test year renews hourly. Needs `REVENUECAT_ACCEPT_TEST_STORE=true` on the server.
- **StoreKit file (optional, needs the `appl_` key):** `npx expo prebuild` writes an
  "Equina StoreKit" scheme; open `ios/Equina.xcworkspace`, choose it and press Run with Metro
  running. Upload Xcode's StoreKit certificate (Editor → Save Public Certificate) to RevenueCat
  first.
- **Sandbox / TestFlight:** needs App Store Connect.

## Not built yet

1. **App Store Connect.** The Apple Developer account (as an organization), the Paid Apps
   agreement, the Small Business Program (15% instead of 30%), the four products with the same
   identifiers and the 7-day introductory offer, and in RevenueCat the App Store app with the
   In-App Purchase key (P8) and the app-specific shared secret (iOS 15 still uses StoreKit 1).
2. **Erasing the RevenueCat customer** when an account is erased (`DELETE /v1/subscribers/{id}`).
   The app already warns, before deletion, that store billing continues.
3. **A per-rider limit on `sync-purchases`**, which calls RevenueCat once per request.
4. **Booking coach sessions** and claiming the event ticket.

## Open questions for Ilinca

1. Do the included coach sessions renew every year, or once per subscription?
2. The event ticket inside an in-app subscription: App Store guideline 3.1.3(e) keeps goods and
   services used outside the app away from in-app purchase. Worth checking before review whether
   the ticket stays a perk claimed outside the app.
3. Free without the Club, as drafted, or Free reading the Club (`read`), so new riders see it?
4. Prices inside her ranges: Plus EUR 3.99–6.99 a month (about 49–59 a year), Premium EUR
   7.99–12.99 a month (about 99–119 a year).
