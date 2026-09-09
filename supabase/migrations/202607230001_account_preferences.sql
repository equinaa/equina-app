begin;

alter table public.app_feature_flags
  drop constraint if exists app_feature_flags_key_check;
alter table public.app_feature_flags
  add constraint app_feature_flags_key_check
  check (key in (
    'account_settings',
    'coach_chat',
    'push_notifications',
    'record_mutations',
    'horse_management',
    'club_publishing',
    'club_interactions',
    'shop_listing_creation',
    'shop_messaging',
    'shop_transactions'
  ));

insert into public.app_feature_flags(key, enabled, rollout_percent, note) values
  ('account_settings', false, 0, 'Enable after session recovery, preference RLS, export, and deletion QA.'),
  ('coach_chat', false, 0, 'Enable after provider, safety, idempotency, and isolation QA.'),
  ('push_notifications', false, 0, 'Enable after device lifecycle, redaction, and delivery QA.')
on conflict (key) do nothing;

create table public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  academy_discipline public.discipline,
  academy_level public.rider_level,
  academy_focus text check (academy_focus is null or char_length(academy_focus) <= 80),
  use_rider_profile boolean not null default true,
  use_selected_horse boolean not null default true,
  use_ride_history boolean not null default true,
  reduced_personalization boolean not null default false,
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  human_messages boolean not null default true,
  order_changes boolean not null default true,
  horse_reminders boolean not null default false,
  academy_reminders boolean not null default false,
  message_previews boolean not null default false,
  quiet_hours_timezone text not null default 'UTC' check (char_length(quiet_hours_timezone) between 1 and 80),
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    (quiet_hours_start is null and quiet_hours_end is null)
    or (quiet_hours_start is not null and quiet_hours_end is not null)
  )
);

create table public.push_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  expo_push_token text not null check (char_length(expo_push_token) between 12 and 512),
  platform text not null check (platform in ('ios', 'android')),
  app_version text not null check (char_length(app_version) between 1 and 40),
  last_seen_at timestamptz not null default now(),
  disabled_reason text check (disabled_reason is null or char_length(disabled_reason) <= 180),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index push_devices_user_active_idx
  on public.push_devices(user_id, last_seen_at desc)
  where revoked_at is null;

create table public.notification_outbox (
  id bigint generated always as identity primary key,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('marketplace_message', 'order_change', 'horse_reminder', 'academy_reminder')),
  entity_type text not null check (char_length(entity_type) between 1 and 40),
  entity_id uuid not null,
  dedupe_key text not null unique check (char_length(dedupe_key) between 8 and 180),
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending', 'processing', 'delivered', 'retry', 'dead_letter', 'suppressed')),
  attempts smallint not null default 0 check (attempts between 0 and 20),
  next_attempt_at timestamptz not null default now(),
  delivered_at timestamptz,
  last_error_code text check (last_error_code is null or char_length(last_error_code) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index notification_outbox_work_idx
  on public.notification_outbox(status, next_attempt_at, id)
  where status in ('pending', 'retry');

create table public.data_export_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'processing', 'ready', 'failed', 'expired')),
  object_path text,
  failure_code text check (failure_code is null or char_length(failure_code) <= 80),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz,
  check (
    (status = 'ready' and object_path is not null and completed_at is not null and expires_at is not null)
    or status <> 'ready'
  )
);
create index data_export_requests_user_idx
  on public.data_export_requests(user_id, requested_at desc);

create table public.account_audit_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in (
    'onboarding_completed',
    'sign_out',
    'data_export_requested',
    'data_export_completed',
    'deletion_scheduled',
    'deletion_canceled',
    'deletion_completed',
    'push_device_registered',
    'push_device_revoked'
  )),
  request_id uuid,
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  created_at timestamptz not null default now()
);
create index account_audit_events_user_idx
  on public.account_audit_events(user_id, created_at desc);

create trigger user_preferences_set_updated_at
before update on public.user_preferences
for each row execute function private.set_updated_at();

create or replace function private.bump_user_preferences_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.version = old.version + 1;
  return new;
end;
$$;

create trigger user_preferences_bump_version
before update on public.user_preferences
for each row execute function private.bump_user_preferences_version();

create trigger notification_preferences_set_updated_at
before update on public.notification_preferences
for each row execute function private.set_updated_at();

create trigger notification_outbox_set_updated_at
before update on public.notification_outbox
for each row execute function private.set_updated_at();

insert into public.user_preferences(user_id, academy_discipline, academy_level)
select id, discipline, skill_level from public.profiles
on conflict (user_id) do nothing;

insert into public.notification_preferences(user_id)
select id from public.profiles
on conflict (user_id) do nothing;

create or replace function private.handle_new_user_preferences()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_preferences(user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.notification_preferences(user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_preferences
after insert on auth.users
for each row execute function private.handle_new_user_preferences();

create or replace function public.complete_equina_onboarding(
  display_name_input text,
  locale_input text,
  discipline_input public.discipline,
  skill_input public.rider_level,
  horse_name_input text,
  horse_breed_input text default null,
  horse_photo_path_input text default null
)
returns table(profile_id uuid, horse_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  target_horse_id uuid;
  safe_locale text;
  onboarding_was_complete boolean := false;
begin
  if actor_id is null then raise exception 'Authentication is required'; end if;
  if char_length(trim(display_name_input)) not between 2 and 80 then raise exception 'A valid display name is required'; end if;
  if char_length(trim(horse_name_input)) not between 2 and 80 then raise exception 'A valid horse name is required'; end if;
  if horse_breed_input is not null and char_length(trim(horse_breed_input)) > 100 then raise exception 'Horse breed is too long'; end if;
  if horse_photo_path_input is not null and char_length(trim(horse_photo_path_input)) > 500 then raise exception 'Horse photo path is too long'; end if;

  safe_locale := case
    when locale_input in ('en', 'ro', 'hu', 'de', 'fr', 'es', 'it') then locale_input
    else 'en'
  end;

  select onboarding_completed_at is not null
  into onboarding_was_complete
  from public.profiles
  where id = actor_id
  for update;

  update public.profiles
  set
    display_name = trim(display_name_input),
    locale = safe_locale,
    discipline = discipline_input,
    skill_level = skill_input,
    onboarding_completed_at = coalesce(onboarding_completed_at, now())
  where id = actor_id;

  if not found then
    insert into public.profiles(
      id, display_name, locale, discipline, skill_level, onboarding_completed_at
    ) values (
      actor_id, trim(display_name_input), safe_locale, discipline_input, skill_input, now()
    );
  end if;

  insert into public.user_preferences(
    user_id, academy_discipline, academy_level
  ) values (
    actor_id, discipline_input, skill_input
  )
  on conflict (user_id) do update set
    academy_discipline = excluded.academy_discipline,
    academy_level = excluded.academy_level;

  insert into public.notification_preferences(user_id)
  values (actor_id)
  on conflict (user_id) do nothing;

  select id into target_horse_id
  from public.horses
  where owner_id = actor_id and is_primary and archived_at is null
  order by created_at
  limit 1
  for update;

  if target_horse_id is null then
    insert into public.horses(
      owner_id, name, breed, discipline, photo_path, is_primary
    ) values (
      actor_id,
      trim(horse_name_input),
      nullif(trim(horse_breed_input), ''),
      discipline_input,
      nullif(trim(horse_photo_path_input), ''),
      true
    )
    returning id into target_horse_id;
  else
    update public.horses
    set
      name = trim(horse_name_input),
      breed = nullif(trim(horse_breed_input), ''),
      discipline = discipline_input,
      photo_path = coalesce(nullif(trim(horse_photo_path_input), ''), photo_path)
    where id = target_horse_id;
  end if;

  if not onboarding_was_complete then
    insert into public.account_audit_events(user_id, event_type, detail)
    values (
      actor_id,
      'onboarding_completed',
      jsonb_build_object('discipline', discipline_input, 'skill_level', skill_input)
    );
  end if;

  return query select actor_id, target_horse_id;
end;
$$;

alter table public.user_preferences enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_devices enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.data_export_requests enable row level security;
alter table public.account_audit_events enable row level security;

create policy user_preferences_read_self
on public.user_preferences for select to authenticated
using (user_id = auth.uid());
create policy user_preferences_insert_self
on public.user_preferences for insert to authenticated
with check (user_id = auth.uid() and private.feature_enabled('account_settings'));
create policy user_preferences_update_self
on public.user_preferences for update to authenticated
using (user_id = auth.uid() and private.feature_enabled('account_settings'))
with check (user_id = auth.uid() and private.feature_enabled('account_settings'));

create policy notification_preferences_read_self
on public.notification_preferences for select to authenticated
using (user_id = auth.uid());
create policy notification_preferences_insert_self
on public.notification_preferences for insert to authenticated
with check (user_id = auth.uid() and private.feature_enabled('account_settings'));
create policy notification_preferences_update_self
on public.notification_preferences for update to authenticated
using (user_id = auth.uid() and private.feature_enabled('account_settings'))
with check (user_id = auth.uid() and private.feature_enabled('account_settings'));

create policy data_export_requests_read_self
on public.data_export_requests for select to authenticated
using (user_id = auth.uid());

revoke execute on function public.complete_equina_onboarding(text, text, public.discipline, public.rider_level, text, text, text)
from public, anon;
grant execute on function public.complete_equina_onboarding(text, text, public.discipline, public.rider_level, text, text, text)
to authenticated;

grant select, insert, update on public.user_preferences to authenticated;
grant select, insert, update on public.notification_preferences to authenticated;
grant select on public.data_export_requests to authenticated;

grant select, insert, update, delete on
  public.user_preferences,
  public.notification_preferences,
  public.push_devices,
  public.notification_outbox,
  public.data_export_requests,
  public.account_audit_events
to service_role;
grant usage, select on sequence public.notification_outbox_id_seq to service_role;
grant usage, select on sequence public.account_audit_events_id_seq to service_role;

commit;
