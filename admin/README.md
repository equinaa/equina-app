# Equina Admin

The staff console: publish Academy lessons and settle the Club moderation queue
without a release. A small Next.js 16 app that talks to the same Supabase project
as the mobile app.

It has no keys of its own. Every request runs with the signed-in staff member's
session, and the database decides what staff may do
(`supabase/migrations/202610050001_admin_console.sql`). Staff powers need two
things: a `moderator` or `admin` row in `public.user_roles`, and a session
confirmed with an authenticator-app code. If either is missing, the account has
no staff powers anywhere, including through the API.

## What it does

| Area | What staff can do |
| --- | --- |
| Lessons | Create drafts, edit details, set chapters, publish and unpublish, delete drafts. A lesson needs a length and a finished video before it can be published, and the database checks both. |
| Moderation | See Club posts and comments that riders reported or the phrase filter hid. **Restore** puts an item back and dismisses its reports. **Remove** keeps it hidden and closes its reports. Each decision is recorded in `moderation_actions` with who made it. |

Not yet: uploading video (the Bunny Stream step), lesson posters, user reports
and sanctions.

## Run it locally

```bash
cd admin
npm install
cp .env.example .env.local   # the project URL and publishable key, same as the app's
npm run dev                  # http://localhost:3100
```

`npm run build` and `npm run typecheck` must pass before a pull request. The
admin's rules are tested from the repo root by `npm test` (`tests/admin.test.ts`
and the admin section of `tests/backend-migrations.test.ts`).

## Deploy

A Vercel project of its own, separate from the web app:

1. In Vercel, add a new project from this repository and set **Root Directory**
   to `admin`. Vercel detects Next.js.
2. Add the two variables from `.env.example` for Production and Preview.
3. Point `admin.equina.ai` at it once the domain's DNS is set up.

Never add the service role key to this project. The admin works without it,
and the tests fail if any admin code reads it.

## Staff accounts

An account becomes staff in two steps:

1. The person signs up like any rider (app or Supabase Dashboard → Authentication
   → Users → Add user).
2. Someone with database access grants the role in the SQL editor:

   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'name@example.com';
   ```

   Use `'moderator'` for someone who only moderates. The difference matters only
   for feature flags, which need `admin`.

At their first sign-in the admin asks them to set up an authenticator app
(1Password, Google Authenticator, Authy). After that, every sign-in asks for
a code.

**Lost phone:** remove their authenticator in the SQL editor. They set up a new
one at their next sign-in.

```sql
delete from auth.mfa_factors
where user_id = (select id from auth.users where email = 'name@example.com');
```

**Removing someone:** delete their `user_roles` row. Their next request has no
staff powers.
