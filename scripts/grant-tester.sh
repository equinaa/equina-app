#!/usr/bin/env bash
# Grant an existing Equina account the core rider features.
#
# The wedge is four capabilities: a horse, its records, the ride journal and
# Ralf. Account settings comes along because a tester needs to be able to
# export or delete their own data.
#
# The account must already exist -- the person signs up in the app first.
# Every global flag is off at 0% rollout, so access is per person, on purpose.
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
