begin;

drop policy collaborators_read_horse on public.horse_collaborators;
create policy collaborators_read_horse on public.horse_collaborators for select to authenticated
using (user_id = auth.uid() or private.can_view_horse(horse_id));

create function public.set_horse_collaborator(
  target_horse_id uuid,
  target_user_id uuid,
  target_access_role public.horse_access_role
)
returns public.horse_collaborators
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid;
  collaborator public.horse_collaborators;
begin
  if not private.feature_enabled('horse_management') then raise exception 'Horse management is not enabled for this account'; end if;
  select h.owner_id into owner_id from public.horses h where h.id = target_horse_id;
  if owner_id is null or owner_id <> auth.uid() then raise exception 'Only the horse owner can manage collaborators'; end if;
  if target_user_id = owner_id then raise exception 'The owner cannot be added as a collaborator'; end if;

  insert into public.horse_collaborators(horse_id, user_id, access_role, invited_by)
  values (target_horse_id, target_user_id, target_access_role, auth.uid())
  on conflict (horse_id, user_id) do update set
    access_role = excluded.access_role,
    invited_by = excluded.invited_by,
    accepted_at = case
      when public.horse_collaborators.access_role = excluded.access_role then public.horse_collaborators.accepted_at
      else null
    end
  returning * into collaborator;
  return collaborator;
end;
$$;

revoke insert on public.horse_collaborators from authenticated;
revoke execute on function public.set_horse_collaborator(uuid, uuid, public.horse_access_role) from public, anon;
grant execute on function public.set_horse_collaborator(uuid, uuid, public.horse_access_role) to authenticated;

commit;
