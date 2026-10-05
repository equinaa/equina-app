begin;

-- The admin console (admin/ in this repo, a separate Next.js app) is where
-- staff publish lessons and work the Club moderation queue. It talks to this
-- database with the staff member's own session, exactly like the app does, so
-- everything it may do is decided here.

-- ---------------------------------------------------------------------------
-- Every staff power needs a second factor.
-- ---------------------------------------------------------------------------
-- A staff session can publish to every rider and take down anyone's post, so
-- a leaked password alone must not be enough. Supabase stamps `aal2` into the
-- session's JWT once the user has verified a TOTP code; until then the session
-- is `aal1` and the account has no staff powers anywhere -- not in the admin,
-- not in the app, not through a direct API call.
--
-- Redefining is_staff() rather than adding a second check means every policy
-- and function that already asks "is this staff?" now asks it this way.
create or replace function private.has_second_factor()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2';
$$;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (private.has_role('moderator') or private.has_role('admin')) and private.has_second_factor();
$$;

revoke all on function private.has_second_factor() from public, anon;
grant execute on function private.has_second_factor() to authenticated;

-- Feature flags were the one staff power that asked for the role directly.
drop policy feature_flags_staff_manage on public.app_feature_flags;
create policy feature_flags_staff_manage on public.app_feature_flags for all to authenticated
using (private.has_role('admin') and private.has_second_factor())
with check (private.has_role('admin') and private.has_second_factor());

-- ---------------------------------------------------------------------------
-- Publishing a lesson.
-- ---------------------------------------------------------------------------
-- A published lesson is one riders can open, so it has to be watchable: a
-- lesson with no ready video shows riders a player that only ever says "still
-- being prepared". Staff edit everything else directly; published_at moves
-- only through staff_set_lesson_published, which checks that first.
revoke insert, update on public.academy_lessons from authenticated;
grant
  insert (slug, title, summary, category, discipline, level, access, duration_seconds,
          coach_name, coach_title, poster_path, position),
  update (slug, title, summary, category, discipline, level, access, duration_seconds,
          coach_name, coach_title, poster_path, position)
  on public.academy_lessons to authenticated;

-- Deleting takes every rider's progress with it, so only a lesson nobody has
-- been able to open yet can be deleted. A published one is unpublished first.
drop policy academy_lessons_staff_manage on public.academy_lessons;
create policy academy_lessons_staff_read on public.academy_lessons
for select to authenticated using (private.is_staff());
create policy academy_lessons_staff_insert on public.academy_lessons
for insert to authenticated with check (private.is_staff());
create policy academy_lessons_staff_update on public.academy_lessons
for update to authenticated using (private.is_staff()) with check (private.is_staff());
create policy academy_lessons_staff_delete_draft on public.academy_lessons
for delete to authenticated using (private.is_staff() and published_at is null);

create or replace function public.staff_set_lesson_published(target_lesson uuid, publish boolean)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  lesson public.academy_lessons%rowtype;
  stamped timestamptz;
begin
  if not private.is_staff() then
    raise exception 'Staff access required.' using errcode = '42501';
  end if;

  select * into lesson from public.academy_lessons where id = target_lesson for update;
  if not found then
    raise exception 'Lesson not found.' using errcode = 'P0002';
  end if;

  if not publish then
    update public.academy_lessons set published_at = null where id = target_lesson;
    return null;
  end if;

  if lesson.published_at is not null then
    return lesson.published_at;
  end if;
  -- Progress is a share of the length, so a lesson without one would show
  -- every rider 0% however much they watched.
  if lesson.duration_seconds is null then
    raise exception 'Add the lesson''s length before publishing it.' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from public.academy_videos video
    where video.lesson_id = target_lesson and video.status = 'ready'
  ) then
    raise exception 'This lesson needs a finished video before it can be published.' using errcode = 'P0001';
  end if;

  update public.academy_lessons set published_at = now()
  where id = target_lesson
  returning published_at into stamped;
  return stamped;
end;
$$;

revoke all on function public.staff_set_lesson_published(uuid, boolean) from public, anon;
grant execute on function public.staff_set_lesson_published(uuid, boolean) to authenticated;

-- Chapters are saved as a set, the way the editor shows them: replacing them
-- one statement at a time could leave a lesson half-saved.
create or replace function public.staff_save_lesson_chapters(target_lesson uuid, marks jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  lesson_length integer;
begin
  if not private.is_staff() then
    raise exception 'Staff access required.' using errcode = '42501';
  end if;
  if jsonb_typeof(marks) is distinct from 'array' or jsonb_array_length(marks) > 60 then
    raise exception 'Chapters must be a list of at most 60 marks.' using errcode = '22023';
  end if;

  select duration_seconds into lesson_length from public.academy_lessons where id = target_lesson;
  if not found then
    raise exception 'Lesson not found.' using errcode = 'P0002';
  end if;
  if lesson_length is not null and exists (
    select 1 from jsonb_array_elements(marks) mark
    where (mark ->> 'starts_at_seconds')::integer >= lesson_length
  ) then
    raise exception 'A chapter starts after the lesson ends.' using errcode = 'P0001';
  end if;

  delete from public.academy_chapters where lesson_id = target_lesson;
  insert into public.academy_chapters(lesson_id, starts_at_seconds, title)
  select target_lesson, (mark ->> 'starts_at_seconds')::integer, trim(mark ->> 'title')
  from jsonb_array_elements(marks) mark;
end;
$$;

revoke all on function public.staff_save_lesson_chapters(uuid, jsonb) from public, anon;
grant execute on function public.staff_save_lesson_chapters(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- The Club moderation queue.
-- ---------------------------------------------------------------------------
-- Under post-moderation (202610020006) content reaches staff two ways: the
-- phrase filter hid it on write, or riders reported it. Staff settle each item
-- once, by restoring it or by removing it.
--
-- Reports were counted across their whole history, so after staff restored a
-- post the very next report hid it again -- the three that staff had already
-- looked at still counted. Only reports still waiting for staff count now.
create or replace function private.hide_reported_club_content()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  reporters integer;
begin
  if new.post_id is not null then
    select count(distinct reporter_id) into reporters
    from public.content_reports
    where post_id = new.post_id and status in ('open', 'reviewing');
    if reporters >= 3 then
      update public.club_posts set moderation_status = 'hidden'
      where id = new.post_id and moderation_status = 'visible';
    end if;
  elsif new.comment_id is not null then
    select count(distinct reporter_id) into reporters
    from public.content_reports
    where comment_id = new.comment_id and status in ('open', 'reviewing');
    if reporters >= 3 then
      update public.club_comments set moderation_status = 'hidden'
      where id = new.comment_id and moderation_status = 'visible';
    end if;
  end if;
  return new;
end;
$$;

-- What is waiting for staff: anything with reports nobody has looked at, and
-- anything riders cannot see that staff have not confirmed -- hidden by the
-- filter or by reports, or still 'pending' from before post-moderation. An
-- item staff removed stays hidden and leaves the queue; one they restored
-- comes back only if it is reported or filtered again. Deleted content is
-- gone and never queued.
create or replace function public.staff_moderation_queue()
returns table (
  content_type text,
  content_id uuid,
  post_id uuid,
  space_name text,
  author_id uuid,
  author_name text,
  body text,
  status public.content_status,
  open_reports integer,
  reasons text[],
  report_details text[],
  last_reported_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.is_staff() then
    raise exception 'Staff access required.' using errcode = '42501';
  end if;

  return query
  with waiting_reports as (
    select
      case when r.post_id is not null then 'post' else 'comment' end as kind,
      coalesce(r.post_id, r.comment_id) as id,
      count(distinct r.reporter_id)::integer as reporters,
      array_agg(distinct r.reason::text order by r.reason::text) as reasons,
      array_remove(array_agg(r.detail order by r.created_at desc), null) as details,
      max(r.created_at) as last_at
    from public.content_reports r
    where r.status in ('open', 'reviewing') and (r.post_id is not null or r.comment_id is not null)
    group by 1, 2
  ),
  last_decision as (
    select distinct on (a.target_type, a.target_id) a.target_type, a.target_id, a.action
    from public.moderation_actions a
    where a.target_type in ('post', 'comment')
    order by a.target_type, a.target_id, a.created_at desc
  ),
  items as (
    select 'post'::text as kind, p.id, p.id as post_id, p.space_id, p.author_id, p.body,
           p.moderation_status, p.created_at
    from public.club_posts p
    union all
    select 'comment'::text, c.id, c.post_id, p.space_id, c.author_id, c.body,
           c.moderation_status, c.created_at
    from public.club_comments c
    join public.club_posts p on p.id = c.post_id
  )
  select
    i.kind,
    i.id,
    i.post_id,
    s.name,
    i.author_id,
    profile.display_name,
    i.body,
    i.moderation_status,
    coalesce(w.reporters, 0),
    coalesce(w.reasons, '{}'::text[]),
    coalesce(w.details, '{}'::text[]),
    w.last_at,
    i.created_at
  from items i
  join public.club_spaces s on s.id = i.space_id
  left join public.profiles profile on profile.id = i.author_id
  left join waiting_reports w on w.kind = i.kind and w.id = i.id
  left join last_decision d on d.target_type = i.kind and d.target_id = i.id
  where i.moderation_status <> 'deleted'
    and (w.id is not null or (i.moderation_status in ('hidden', 'pending') and d.action is distinct from 'hide'))
  order by coalesce(w.last_at, i.created_at) desc
  limit 200;
end;
$$;

revoke all on function public.staff_moderation_queue() from public, anon;
grant execute on function public.staff_moderation_queue() to authenticated;

-- One decision settles the item and every report waiting on it, and leaves a
-- record of who decided what.
create or replace function public.staff_moderate_content(
  content_type text,
  content_id uuid,
  decision text,
  note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_status public.content_status;
  outcome public.report_status;
  touched integer;
begin
  if not private.is_staff() then
    raise exception 'Staff access required.' using errcode = '42501';
  end if;
  if decision = 'restore' then
    next_status := 'visible';
    outcome := 'dismissed';
  elsif decision = 'remove' then
    next_status := 'hidden';
    outcome := 'actioned';
  else
    raise exception 'Choose to restore or remove.' using errcode = '22023';
  end if;
  if note is not null and char_length(note) > 1000 then
    raise exception 'Keep the note under 1000 characters.' using errcode = '22023';
  end if;

  if content_type = 'post' then
    update public.club_posts set moderation_status = next_status
    where id = content_id and moderation_status <> 'deleted';
    get diagnostics touched = row_count;
    update public.content_reports set status = outcome, resolved_at = now(), assigned_to = auth.uid()
    where post_id = content_id and status in ('open', 'reviewing');
  elsif content_type = 'comment' then
    update public.club_comments set moderation_status = next_status
    where id = content_id and moderation_status <> 'deleted';
    get diagnostics touched = row_count;
    update public.content_reports set status = outcome, resolved_at = now(), assigned_to = auth.uid()
    where comment_id = content_id and status in ('open', 'reviewing');
  else
    raise exception 'Only posts and comments are moderated here.' using errcode = '22023';
  end if;

  if touched = 0 then
    raise exception 'This post or comment no longer exists.' using errcode = 'P0002';
  end if;

  insert into public.moderation_actions(moderator_id, target_type, target_id, action, notes)
  values (
    auth.uid(),
    content_type,
    content_id,
    case decision when 'restore' then 'approve' else 'hide' end,
    nullif(trim(note), '')
  );
end;
$$;

revoke all on function public.staff_moderate_content(text, uuid, text, text) from public, anon;
grant execute on function public.staff_moderate_content(text, uuid, text, text) to authenticated;

commit;
