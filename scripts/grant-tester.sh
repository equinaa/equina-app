#!/usr/bin/env bash
# Grant an existing Equina account the core rider features, by hand.
#
# The normal way into the beta is Admin -> Beta: invite the email, and once
# the account exists with that email confirmed it gets every feature that is
# on globally (docs/EQUINA_FEATURE_FLAG_POLICY.md, "The Beta Door"). Use this
# script only for what an invite cannot do, such as giving one account these
# features while they are still off for everyone.
#
# The wedge is four capabilities: a horse, its records, the ride journal and
# Ralf. Account settings comes along because a tester needs to be able to
# export or delete their own data.
#
# The account must already exist -- the person signs up in the app first.
# The five features are per-person overrides, which win over the global flags.
# The script also invites the account's email, as Admin -> Beta would, or the
# app would keep it at the beta door.
#
#   ./scripts/grant-tester.sh someone@example.com [days]
#
set -euo pipefail

EMAIL="${1:?usage: grant-tester.sh <email> [days]}"
DAYS="${2:-120}"

read -r -d '' SQL <<SQL_END || true
do \$\$
declare
  target uuid;
  flag text;
begin
  select id into target from auth.users where email = '${EMAIL}';
  if target is null then
    raise exception 'No account for %. Ask them to sign up first.', '${EMAIL}';
  end if;

  insert into public.beta_invites (email, note)
  select lower(trim(email)), 'tester access' from auth.users where id = target
  on conflict (email) do update set revoked_at = null;

  foreach flag in array array['horse_management','record_mutations','ride_logging','coach_chat','account_settings']
  loop
    insert into public.feature_flag_overrides (user_id, key, enabled, expires_at, note)
    values (target, flag, true, now() + interval '${DAYS} days', 'tester access')
    on conflict (user_id, key) do update
      set enabled = true, expires_at = excluded.expires_at, updated_at = now();
  end loop;
end
\$\$;
SQL_END

OUT="$(supabase db query "${SQL}" --linked 2>&1)" || true
if printf '%s' "$OUT" | grep -q 'No account for'; then
  echo "No account for ${EMAIL}. Ask them to sign up in the app first, then re-run this." >&2
  exit 1
fi

supabase db query "select o.key, o.expires_at::date as until from public.feature_flag_overrides o join auth.users u on u.id = o.user_id where u.email = '${EMAIL}' order by o.key" --linked
