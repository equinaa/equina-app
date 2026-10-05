begin;

-- Riders see each other by name and photo, nothing more.
--
-- profiles_read_authenticated (202607210001) lets every signed-in account read
-- every profile, and authenticated held SELECT on the whole table. Since
-- sign-up with a password needs no confirmation (the TestFlight cohort), a
-- stranger could create an account and list every rider's location, bio,
-- discipline and level. For horse owners, where someone keeps their horse is
-- physical security, not only privacy.
--
-- Other riders need what the Club, messages and blocked-accounts list show: a
-- name and a picture. The rest of a profile belongs to the rider alone.
--
-- Column privileges cannot depend on the row, so a rider's own full profile
-- comes from my_profile() rather than from the table. Edge Functions read
-- profiles with the service role and are unaffected.

revoke select on public.profiles from anon, authenticated;
grant select (id, display_name, avatar_path) on public.profiles to authenticated;

create or replace function public.my_profile()
returns setof public.profiles
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.profiles where id = auth.uid();
$$;

revoke all on function public.my_profile() from public, anon;
grant execute on function public.my_profile() to authenticated;

commit;
