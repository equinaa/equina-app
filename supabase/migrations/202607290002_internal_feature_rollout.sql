begin;

create table public.feature_flag_overrides (
  user_id uuid not null references auth.users(id) on delete cascade,
  key text not null references public.app_feature_flags(key) on update cascade on delete cascade,
  enabled boolean not null,
  expires_at timestamptz,
  note text check (note is null or char_length(note) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index feature_flag_overrides_expiry_idx
on public.feature_flag_overrides(expires_at)
where expires_at is not null;
create index feature_flag_overrides_created_by_idx
on public.feature_flag_overrides(created_by);

alter table public.feature_flag_overrides enable row level security;

revoke all on public.feature_flag_overrides from public, anon, authenticated;

create trigger feature_flag_overrides_set_updated_at
before update on public.feature_flag_overrides
for each row execute function private.set_updated_at();

create or replace function private.feature_enabled(flag_key text, target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select o.enabled
      from public.feature_flag_overrides o
      where o.user_id = target_user
        and o.key = flag_key
        and (o.expires_at is null or o.expires_at > now())
    ),
    (
      select
        target_user is not null
        and f.enabled
        and f.rollout_percent > 0
        and (
          f.rollout_percent = 100
          or private.rollout_bucket(target_user, f.key) < f.rollout_percent
        )
      from public.app_feature_flags f
      where f.key = flag_key
    ),
    false
  );
$$;

revoke execute on function private.feature_enabled(text, uuid) from public, anon;
grant execute on function private.feature_enabled(text, uuid) to authenticated;

create or replace function public.set_feature_flag_override(
  target_user_id uuid,
  target_key text,
  target_enabled boolean,
  target_expires_at timestamptz default null,
  target_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'Staff access required';
  end if;
  if not exists (select 1 from auth.users where id = target_user_id) then
    raise exception 'Target user does not exist';
  end if;
  if not exists (select 1 from public.app_feature_flags where key = target_key) then
    raise exception 'Unknown feature flag';
  end if;
  if target_expires_at is not null and target_expires_at <= now() then
    raise exception 'Expiry must be in the future';
  end if;

  insert into public.feature_flag_overrides(
    user_id,
    key,
    enabled,
    expires_at,
    note,
    created_by
  )
  values (
    target_user_id,
    target_key,
    target_enabled,
    target_expires_at,
    nullif(trim(target_note), ''),
    auth.uid()
  )
  on conflict (user_id, key) do update
  set
    enabled = excluded.enabled,
    expires_at = excluded.expires_at,
    note = excluded.note,
    created_by = auth.uid(),
    updated_at = now();
end;
$$;

create or replace function public.clear_feature_flag_override(
  target_user_id uuid,
  target_key text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'Staff access required';
  end if;
  delete from public.feature_flag_overrides
  where user_id = target_user_id and key = target_key;
end;
$$;

revoke all on function public.set_feature_flag_override(uuid, text, boolean, timestamptz, text) from public, anon;
revoke all on function public.clear_feature_flag_override(uuid, text) from public, anon;
grant execute on function public.set_feature_flag_override(uuid, text, boolean, timestamptz, text) to authenticated;
grant execute on function public.clear_feature_flag_override(uuid, text) to authenticated;

commit;
