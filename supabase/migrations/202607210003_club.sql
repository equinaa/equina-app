begin;

create type public.club_membership_role as enum ('member', 'coach', 'moderator', 'owner');
create type public.club_post_type as enum ('ride', 'photo', 'video', 'journal', 'question');
create type public.content_status as enum ('draft', 'pending', 'visible', 'hidden', 'deleted');
create type public.club_reaction_type as enum ('like', 'support', 'insightful');
create type public.report_reason as enum ('spam', 'scam', 'harassment', 'unsafe_advice', 'animal_welfare', 'nudity', 'other');
create type public.report_status as enum ('open', 'reviewing', 'actioned', 'dismissed');

create table public.club_spaces (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{2,50}$'),
  name text not null check (char_length(name) between 2 and 80),
  description text check (description is null or char_length(description) <= 280),
  discipline public.discipline,
  is_private boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.club_memberships (
  space_id uuid not null references public.club_spaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.club_membership_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (space_id, user_id)
);

create table public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create table public.club_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  space_id uuid not null references public.club_spaces(id) on delete cascade,
  post_type public.club_post_type not null,
  body text not null check (char_length(trim(body)) between 1 and 4000),
  horse_id uuid references public.horses(id) on delete set null,
  ride_id uuid,
  moderation_status public.content_status not null default 'pending',
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index club_posts_feed_idx on public.club_posts(space_id, created_at desc) where moderation_status = 'visible';
create index club_posts_author_idx on public.club_posts(author_id, created_at desc);

create table public.club_post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.club_posts(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  object_path text not null unique,
  media_type text not null check (media_type in ('image', 'video')),
  mime_type text not null,
  byte_size integer not null check (byte_size between 1 and 52428800),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  position smallint not null default 0 check (position between 0 and 9),
  created_at timestamptz not null default now()
);

create table public.club_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.club_posts(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.club_comments(id) on delete cascade,
  body text not null check (char_length(trim(body)) between 1 and 1200),
  moderation_status public.content_status not null default 'pending',
  edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index club_comments_post_idx on public.club_comments(post_id, created_at);

create table public.club_reactions (
  post_id uuid not null references public.club_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction public.club_reaction_type not null default 'like',
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.content_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid references public.club_posts(id) on delete cascade,
  comment_id uuid references public.club_comments(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete cascade,
  reason public.report_reason not null,
  detail text check (detail is null or char_length(detail) <= 1000),
  status public.report_status not null default 'open',
  assigned_to uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(post_id, comment_id, reported_user_id) = 1)
);
create unique index reports_no_duplicate_post on public.content_reports(reporter_id, post_id) where post_id is not null and status in ('open', 'reviewing');
create unique index reports_no_duplicate_comment on public.content_reports(reporter_id, comment_id) where comment_id is not null and status in ('open', 'reviewing');

create table public.moderation_actions (
  id uuid primary key default gen_random_uuid(),
  moderator_id uuid not null references auth.users(id) on delete restrict,
  report_id uuid references public.content_reports(id) on delete set null,
  target_type text not null check (target_type in ('post', 'comment', 'user')),
  target_id uuid not null,
  action text not null check (action in ('approve', 'hide', 'delete', 'warn', 'suspend')),
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);

create or replace function private.club_content_status(content text)
returns public.content_status
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(content) ~ '(diagnose|ignore the vet|colic treatment|laminitis cure|buy followers|crypto investment)'
      then 'pending'::public.content_status
    else 'visible'::public.content_status
  end;
$$;

create or replace function private.moderate_club_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.body is distinct from old.body then
    new.moderation_status = private.club_content_status(new.body);
    if tg_op = 'UPDATE' then new.edited_at = now(); end if;
  end if;
  return new;
end;
$$;

create or replace function private.can_read_space(target_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.club_spaces s
    where s.id = target_space_id
      and (not s.is_private or exists (
        select 1 from public.club_memberships m where m.space_id = s.id and m.user_id = auth.uid()
      ) or private.is_staff())
  );
$$;

create trigger club_posts_moderate before insert or update of body on public.club_posts
for each row execute function private.moderate_club_post();
create trigger club_comments_moderate before insert or update of body on public.club_comments
for each row execute function private.moderate_club_post();
create trigger club_posts_set_updated_at before update on public.club_posts
for each row execute function private.set_updated_at();
create trigger club_comments_set_updated_at before update on public.club_comments
for each row execute function private.set_updated_at();

alter table public.club_spaces enable row level security;
alter table public.club_memberships enable row level security;
alter table public.user_blocks enable row level security;
alter table public.club_posts enable row level security;
alter table public.club_post_media enable row level security;
alter table public.club_comments enable row level security;
alter table public.club_reactions enable row level security;
alter table public.content_reports enable row level security;
alter table public.moderation_actions enable row level security;

create policy spaces_read on public.club_spaces for select to authenticated using (private.can_read_space(id));
create policy memberships_read on public.club_memberships for select to authenticated using (user_id = auth.uid() or private.can_read_space(space_id));
create policy memberships_join_public on public.club_memberships for insert to authenticated
with check (user_id = auth.uid() and role = 'member' and exists (select 1 from public.club_spaces s where s.id = space_id and not s.is_private));
create policy memberships_leave_self on public.club_memberships for delete to authenticated using (user_id = auth.uid() and role = 'member');

create policy blocks_manage_self on public.user_blocks for all to authenticated
using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());

create policy posts_read on public.club_posts for select to authenticated
using (
  (author_id = auth.uid() or private.is_staff() or moderation_status = 'visible')
  and private.can_read_space(space_id)
  and not exists (select 1 from public.user_blocks b where (b.blocker_id = auth.uid() and b.blocked_id = author_id) or (b.blocker_id = author_id and b.blocked_id = auth.uid()))
);
create policy posts_create on public.club_posts for insert to authenticated
with check (author_id = auth.uid() and private.can_read_space(space_id));
create policy posts_update_own on public.club_posts for update to authenticated
using (author_id = auth.uid() or private.is_staff())
with check (author_id = auth.uid() or private.is_staff());
create policy posts_delete_own on public.club_posts for delete to authenticated
using (author_id = auth.uid() or private.is_staff());

create policy post_media_read on public.club_post_media for select to authenticated
using (exists (select 1 from public.club_posts p where p.id = post_id));
create policy post_media_create on public.club_post_media for insert to authenticated
with check (uploaded_by = auth.uid() and exists (select 1 from public.club_posts p where p.id = post_id and p.author_id = auth.uid()));
create policy post_media_delete on public.club_post_media for delete to authenticated
using (uploaded_by = auth.uid() or private.is_staff());

create policy comments_read on public.club_comments for select to authenticated
using (
  (author_id = auth.uid() or private.is_staff() or moderation_status = 'visible')
  and exists (select 1 from public.club_posts p where p.id = post_id)
);
create policy comments_create on public.club_comments for insert to authenticated
with check (author_id = auth.uid() and exists (select 1 from public.club_posts p where p.id = post_id and p.moderation_status = 'visible'));
create policy comments_update_own on public.club_comments for update to authenticated
using (author_id = auth.uid() or private.is_staff()) with check (author_id = auth.uid() or private.is_staff());
create policy comments_delete_own on public.club_comments for delete to authenticated
using (author_id = auth.uid() or private.is_staff());

create policy reactions_read on public.club_reactions for select to authenticated
using (exists (select 1 from public.club_posts p where p.id = post_id));
create policy reactions_create on public.club_reactions for insert to authenticated
with check (user_id = auth.uid() and exists (select 1 from public.club_posts p where p.id = post_id and p.moderation_status = 'visible'));
create policy reactions_change_own on public.club_reactions for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reactions_delete_own on public.club_reactions for delete to authenticated using (user_id = auth.uid());

create policy reports_create on public.content_reports for insert to authenticated with check (reporter_id = auth.uid());
create policy reports_read on public.content_reports for select to authenticated using (reporter_id = auth.uid() or private.is_staff());
create policy reports_staff_update on public.content_reports for update to authenticated using (private.is_staff()) with check (private.is_staff());
create policy moderation_actions_staff on public.moderation_actions for all to authenticated using (private.is_staff()) with check (private.is_staff());

grant select on public.club_spaces, public.club_memberships, public.club_posts, public.club_post_media, public.club_comments, public.club_reactions to authenticated;
grant insert, delete on public.club_memberships to authenticated;
grant select, insert, update, delete on public.user_blocks, public.club_posts, public.club_post_media, public.club_comments, public.club_reactions to authenticated;
grant select, insert, update on public.content_reports to authenticated;
grant select, insert, update, delete on public.moderation_actions to authenticated;
grant execute on function private.can_read_space(uuid) to authenticated;

insert into public.club_spaces (slug, name, description, discipline)
values
  ('dressage', 'Dressage', 'Training, feel, and thoughtful progress.', 'dressage'),
  ('jumping', 'Jumping', 'Lines, rhythm, confidence, and competition.', 'jumping'),
  ('eventing', 'Eventing', 'Three phases, one partnership.', 'eventing'),
  ('western', 'Western', 'Western riding and horsemanship.', 'western'),
  ('endurance', 'Endurance', 'Conditioning, recovery, and distance.', 'endurance'),
  ('trail', 'Trail', 'Trail riding, confidence, and care.', 'trail'),
  ('coach-qa', 'Coach Q&A', 'Questions reviewed by verified professionals.', null)
on conflict (slug) do nothing;

commit;
