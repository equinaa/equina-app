begin;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create type public.app_role as enum ('rider', 'seller', 'coach', 'moderator', 'admin');
create type public.discipline as enum ('dressage', 'jumping', 'eventing', 'western', 'endurance', 'trail');
create type public.rider_level as enum ('beginner', 'intermediate', 'advanced', 'pro');
create type public.seller_verification_status as enum ('unstarted', 'identity_pending', 'payout_pending', 'verified', 'limited', 'suspended');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Rider' check (char_length(display_name) between 1 and 80),
  avatar_path text,
  locale text not null default 'en' check (locale in ('en', 'ro', 'hu', 'de', 'fr', 'es', 'it')),
  location text check (location is null or char_length(location) <= 120),
  discipline public.discipline,
  skill_level public.rider_level,
  bio text check (bio is null or char_length(bio) <= 600),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

create table public.account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  reason text check (reason is null or char_length(reason) <= 500),
  requested_at timestamptz not null default now(),
  scheduled_for timestamptz not null default (now() + interval '14 days'),
  canceled_at timestamptz,
  completed_at timestamptz
);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function private.has_role(required_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = auth.uid() and role = required_role
  );
$$;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('moderator') or private.has_role('admin');
$$;

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, locale)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, 'Rider'), '@', 1)),
    case
      when new.raw_user_meta_data ->> 'locale' in ('en', 'ro', 'hu', 'de', 'fr', 'es', 'it')
        then new.raw_user_meta_data ->> 'locale'
      else 'en'
    end
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'rider')
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.account_deletion_requests enable row level security;

create policy profiles_read_authenticated
on public.profiles for select to authenticated
using (true);

create policy profiles_update_self
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy roles_read_self
on public.user_roles for select to authenticated
using (user_id = auth.uid() or private.is_staff());

create policy deletion_request_read_self
on public.account_deletion_requests for select to authenticated
using (user_id = auth.uid());

create policy deletion_request_create_self
on public.account_deletion_requests for insert to authenticated
with check (user_id = auth.uid());

create policy deletion_request_cancel_self
on public.account_deletion_requests for update to authenticated
using (user_id = auth.uid() and completed_at is null)
with check (user_id = auth.uid() and completed_at is null);

grant usage on schema public to anon, authenticated;
grant select on public.profiles to authenticated;
grant update (display_name, avatar_path, locale, location, discipline, skill_level, bio, onboarding_completed_at) on public.profiles to authenticated;
grant select on public.user_roles to authenticated;
grant select, insert, update (canceled_at) on public.account_deletion_requests to authenticated;
grant execute on function private.has_role(public.app_role) to authenticated;
grant execute on function private.is_staff() to authenticated;

commit;

