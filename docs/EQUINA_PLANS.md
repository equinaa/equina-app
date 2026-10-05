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
| `my_plan()` | Everything the app needs in one call: the plan, whether it is applied, picks, Club access and all three plans. |
| `academy_playback_source` | Refuses a locked lesson with PT402; `academy-playback` turns that into 402 `lesson_locked`. |
| Club policies | Restrictive policies on posts, comments, reactions, media and memberships, through `private.club_access()`. |
| `private.ensure_free_coach_credits` | Grants the monthly allowance of the rider's plan, from the day the plan started. |
| `staff_update_plan_tier`, `staff_set_plan`, `staff_list_plans` | The admin's Plans page. Admin role with a second factor. |

## The founding phase and the `plans` flag

`plans` is off by default. While it is off every signed-in rider has every lesson and the whole
Club, and the plan screen says so; the plans only decide Ralf's monthly allowance.

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

## Not built yet

1. **Selling.** Needs the Apple Developer account (as an organization), the Paid Apps agreement
   and the Small Business Program (15% instead of 30%). Then: Plus and Premium products, monthly
   and annual, each with the 7-day introductory offer, in App Store Connect; the purchase in the
   app (StoreKit, through RevenueCat or `expo-iap`); and App Store Server Notifications v2 to an
   edge function that writes `plan_subscriptions` (`source = 'app_store'`, the original
   transaction id, status, trial end, `ends_at` = period end plus grace).
2. **Buttons on the plan screen.** It shows the plans; subscribing arrives with item 1.
3. **Booking coach sessions** and claiming the event ticket.

## Open questions for Ilinca

1. Do the included coach sessions renew every year, or once per subscription?
2. The event ticket inside an in-app subscription: App Store guideline 3.1.3(e) keeps goods and
   services used outside the app away from in-app purchase. Worth checking before review whether
   the ticket stays a perk claimed outside the app.
3. Free without the Club, as drafted, or Free reading the Club (`read`), so new riders see it?
4. Prices inside her ranges: Plus EUR 3.99–6.99 a month (about 49–59 a year), Premium EUR
   7.99–12.99 a month (about 99–119 a year).
