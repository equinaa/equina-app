begin;

alter table public.account_audit_events
  drop constraint if exists account_audit_events_event_type_check;
alter table public.account_audit_events
  add constraint account_audit_events_event_type_check
  check (event_type in (
    'onboarding_completed',
    'starter_pack_unlocked',
    'sign_out',
    'data_export_requested',
    'data_export_completed',
    'deletion_scheduled',
    'deletion_canceled',
    'deletion_completed',
    'push_device_registered',
    'push_device_revoked'
  ));

create table public.onboarding_starter_packs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  reward_version smallint not null default 1 check (reward_version = 1),
  first_ride_focus text not null check (char_length(first_ride_focus) between 2 and 80),
  academy_focus text not null check (char_length(academy_focus) between 2 and 80),
  ralf_briefing_enabled boolean not null default true,
  unlocked_at timestamptz not null default now()
);

alter table public.onboarding_starter_packs enable row level security;

create policy onboarding_starter_packs_read_self
on public.onboarding_starter_packs for select to authenticated
using (user_id = auth.uid());

grant select on public.onboarding_starter_packs to authenticated;

create or replace function private.unlock_onboarding_starter_pack()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ride_focus text;
  lesson_focus text;
  inserted_count integer := 0;
begin
  if new.onboarding_completed_at is null then return new; end if;
  if tg_op = 'UPDATE' and old.onboarding_completed_at is not null then return new; end if;

  ride_focus := case new.discipline
    when 'dressage' then 'Soft contact'
    when 'jumping' then 'Calm line'
    when 'eventing' then 'Balanced fitness'
    when 'western' then 'Responsive transitions'
    when 'endurance' then 'Base conditioning'
    else 'Calm miles'
  end;
  lesson_focus := case new.discipline
    when 'dressage' then 'Precision'
    when 'jumping' then 'Rhythm'
    when 'eventing' then 'Fitness'
    when 'western' then 'Responsiveness'
    when 'endurance' then 'Conditioning'
    else 'Confidence'
  end;

  insert into public.onboarding_starter_packs(
    user_id, first_ride_focus, academy_focus
  ) values (
    new.id, ride_focus, lesson_focus
  )
  on conflict (user_id) do nothing;
  get diagnostics inserted_count = row_count;

  update public.user_preferences
  set academy_focus = coalesce(academy_focus, lesson_focus)
  where user_id = new.id;

  if inserted_count = 1 then
    insert into public.account_audit_events(user_id, event_type, detail)
    values (
      new.id,
      'starter_pack_unlocked',
      jsonb_build_object(
        'reward_version', 1,
        'first_ride_focus', ride_focus,
        'academy_focus', lesson_focus,
        'ralf_briefing_enabled', true
      )
    );
  end if;

  return new;
end;
$$;

create trigger profiles_unlock_starter_pack
after insert or update of onboarding_completed_at on public.profiles
for each row execute function private.unlock_onboarding_starter_pack();

insert into public.onboarding_starter_packs(
  user_id, first_ride_focus, academy_focus
)
select
  id,
  case discipline
    when 'dressage' then 'Soft contact'
    when 'jumping' then 'Calm line'
    when 'eventing' then 'Balanced fitness'
    when 'western' then 'Responsive transitions'
    when 'endurance' then 'Base conditioning'
    else 'Calm miles'
  end,
  case discipline
    when 'dressage' then 'Precision'
    when 'jumping' then 'Rhythm'
    when 'eventing' then 'Fitness'
    when 'western' then 'Responsiveness'
    when 'endurance' then 'Conditioning'
    else 'Confidence'
  end
from public.profiles
where onboarding_completed_at is not null
on conflict (user_id) do nothing;

commit;
