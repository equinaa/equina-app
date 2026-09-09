begin;

create type public.horse_access_role as enum ('viewer', 'editor');
create type public.horse_record_type as enum ('passport', 'vet', 'lab', 'vaccination', 'dental', 'farrier', 'nutrition', 'care', 'note');
create type public.horse_record_status as enum ('current', 'due', 'expired', 'archived');

create table public.horses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  breed text check (breed is null or char_length(breed) <= 100),
  discipline public.discipline,
  birth_date date,
  sex text check (sex is null or sex in ('mare', 'gelding', 'stallion', 'unknown')),
  height_cm numeric(5,1) check (height_cm is null or height_cm between 50 and 230),
  photo_path text,
  is_primary boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index horses_one_primary_per_owner
on public.horses(owner_id) where is_primary and archived_at is null;
create index horses_owner_created_idx on public.horses(owner_id, created_at desc);

create table public.horse_collaborators (
  horse_id uuid not null references public.horses(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  access_role public.horse_access_role not null,
  invited_by uuid not null references auth.users(id) on delete cascade,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (horse_id, user_id)
);

create table public.horse_records (
  id uuid primary key default gen_random_uuid(),
  horse_id uuid not null references public.horses(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  record_type public.horse_record_type not null,
  status public.horse_record_status not null default 'current',
  title text not null check (char_length(trim(title)) between 1 and 120),
  occurred_on date not null default current_date,
  due_on date,
  provider_name text check (provider_name is null or char_length(provider_name) <= 120),
  notes text check (notes is null or char_length(notes) <= 4000),
  source text not null default 'rider' check (source in ('rider', 'vet', 'lab', 'nutritionist', 'coach', 'stable', 'import')),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index horse_records_timeline_idx on public.horse_records(horse_id, occurred_on desc, created_at desc);

create table public.horse_record_files (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.horse_records(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  object_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 180),
  mime_type text not null check (mime_type in ('application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif')),
  byte_size integer not null check (byte_size between 1 and 20971520),
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now()
);

create or replace function private.can_view_horse(target_horse_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.horses h
    where h.id = target_horse_id
      and (
        h.owner_id = auth.uid()
        or exists (
          select 1 from public.horse_collaborators hc
          where hc.horse_id = h.id and hc.user_id = auth.uid() and hc.accepted_at is not null
        )
        or private.is_staff()
      )
  );
$$;

create or replace function private.can_edit_horse(target_horse_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.horses h
    where h.id = target_horse_id
      and (
        h.owner_id = auth.uid()
        or exists (
          select 1 from public.horse_collaborators hc
          where hc.horse_id = h.id
            and hc.user_id = auth.uid()
            and hc.access_role = 'editor'
            and hc.accepted_at is not null
        )
        or private.is_staff()
      )
  );
$$;

create or replace function private.keep_single_primary_horse()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_primary and new.archived_at is null then
    update public.horses
      set is_primary = false, updated_at = now()
      where owner_id = new.owner_id and id <> new.id and is_primary;
  end if;
  return new;
end;
$$;

create trigger horses_set_updated_at before update on public.horses
for each row execute function private.set_updated_at();
create trigger horse_records_set_updated_at before update on public.horse_records
for each row execute function private.set_updated_at();
create trigger horses_keep_single_primary before insert or update of is_primary, archived_at on public.horses
for each row execute function private.keep_single_primary_horse();

alter table public.horses enable row level security;
alter table public.horse_collaborators enable row level security;
alter table public.horse_records enable row level security;
alter table public.horse_record_files enable row level security;

create policy horses_read_authorized on public.horses for select to authenticated
using (owner_id = auth.uid() or private.can_view_horse(id));
create policy horses_create_owner on public.horses for insert to authenticated
with check (owner_id = auth.uid());
create policy horses_update_editor on public.horses for update to authenticated
using (private.can_edit_horse(id))
with check (private.can_edit_horse(id));
create policy horses_delete_owner on public.horses for delete to authenticated
using (owner_id = auth.uid());

create policy collaborators_read_horse on public.horse_collaborators for select to authenticated
using (private.can_view_horse(horse_id));
create policy collaborators_manage_owner on public.horse_collaborators for all to authenticated
using (exists (select 1 from public.horses h where h.id = horse_id and h.owner_id = auth.uid()))
with check (exists (select 1 from public.horses h where h.id = horse_id and h.owner_id = auth.uid()));

create policy records_read_horse on public.horse_records for select to authenticated
using (private.can_view_horse(horse_id));
create policy records_create_editor on public.horse_records for insert to authenticated
with check (created_by = auth.uid() and private.can_edit_horse(horse_id));
create policy records_update_editor on public.horse_records for update to authenticated
using (private.can_edit_horse(horse_id))
with check (private.can_edit_horse(horse_id));
create policy records_delete_editor on public.horse_records for delete to authenticated
using (private.can_edit_horse(horse_id));

create policy record_files_read_horse on public.horse_record_files for select to authenticated
using (exists (select 1 from public.horse_records r where r.id = record_id and private.can_view_horse(r.horse_id)));
create policy record_files_create_editor on public.horse_record_files for insert to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (select 1 from public.horse_records r where r.id = record_id and private.can_edit_horse(r.horse_id))
);
create policy record_files_delete_editor on public.horse_record_files for delete to authenticated
using (exists (select 1 from public.horse_records r where r.id = record_id and private.can_edit_horse(r.horse_id)));

grant select, insert, update, delete on public.horses to authenticated;
grant select, insert, update, delete on public.horse_collaborators to authenticated;
grant select, insert, update, delete on public.horse_records to authenticated;
grant select, insert, delete on public.horse_record_files to authenticated;
grant execute on function private.can_view_horse(uuid) to authenticated;
grant execute on function private.can_edit_horse(uuid) to authenticated;

commit;
