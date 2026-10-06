begin;

-- Club, the social part: replies to a comment, and the activity a rider is
-- told about -- a comment on their post, a reply to their comment, a like.
--
-- Push waits for the Apple account and the notification worker; this is the
-- in-app inbox those will deliver from later.

-- ---------------------------------------------------------------------------
-- Replies.
-- ---------------------------------------------------------------------------
-- club_comments.parent_id has existed since 202607210003 with nothing checking
-- it. A reply answers a comment on the same post, and threads are one level
-- deep: an answer to a reply joins the thread it is in, as the app shows it.
create or replace function private.club_comment_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  parent public.club_comments;
begin
  if new.parent_id is null then
    return new;
  end if;

  select * into parent from public.club_comments where id = new.parent_id;
  if parent.id is null or parent.post_id <> new.post_id then
    raise exception 'A reply has to answer a comment on the same post.' using errcode = '22023';
  end if;
  if parent.moderation_status <> 'visible' then
    raise exception 'That comment is no longer in the Club.' using errcode = '22023';
  end if;

  if parent.parent_id is not null then
    new.parent_id := parent.parent_id;
  end if;
  return new;
end;
$$;

drop trigger if exists club_comments_thread on public.club_comments;
create trigger club_comments_thread
before insert on public.club_comments
for each row execute function private.club_comment_thread();

-- ---------------------------------------------------------------------------
-- Activity.
-- ---------------------------------------------------------------------------
-- One row per thing a rider is told about. Written only by the triggers below;
-- read by the recipient, under the same rules as what it points at: a post or
-- comment they can no longer see, or someone blocked either way, hides it.
create table public.club_activity (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('comment', 'reply', 'like')),
  post_id uuid not null references public.club_posts(id) on delete cascade,
  comment_id uuid references public.club_comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  check ((kind = 'like') = (comment_id is null)),
  check (recipient_id <> actor_id)
);

create index club_activity_recipient_idx on public.club_activity(recipient_id, created_at desc);
create index club_activity_actor_idx on public.club_activity(actor_id);
create index club_activity_post_idx on public.club_activity(post_id);
-- Liking, unliking and liking again tells the author once.
create unique index club_activity_like_once on public.club_activity(recipient_id, actor_id, post_id) where kind = 'like';
create unique index club_activity_comment_once on public.club_activity(recipient_id, comment_id) where comment_id is not null;

alter table public.club_activity enable row level security;
revoke all on public.club_activity from public, anon, authenticated;
grant select on public.club_activity to authenticated;
grant select, insert, update, delete on public.club_activity to service_role;

create policy club_activity_read_own on public.club_activity for select to authenticated
using (
  recipient_id = (select auth.uid())
  and not exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = recipient_id and b.blocked_id = actor_id)
       or (b.blocker_id = actor_id and b.blocked_id = recipient_id)
  )
  -- Read under their own policies: hidden, deleted, or outside the rider's
  -- Club access, and the activity goes with them.
  and exists (select 1 from public.club_posts p where p.id = post_id)
  and (comment_id is null or exists (select 1 from public.club_comments c where c.id = comment_id))
);

-- Blocking stops new activity too, not only its display.
create or replace function private.club_blocked_between(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = first_user and b.blocked_id = second_user)
       or (b.blocker_id = second_user and b.blocked_id = first_user)
  );
$$;

revoke execute on function private.club_blocked_between(uuid, uuid) from public, anon, authenticated;

-- A visible comment tells the post's author, and a reply also tells the author
-- of the comment it answers. A comment that becomes visible later (provider
-- moderation) tells them then; one hidden at once by the phrase filter never
-- does.
create or replace function private.club_activity_for_comment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_author uuid;
  parent_author uuid;
begin
  if new.moderation_status <> 'visible' then
    return null;
  end if;
  if tg_op = 'UPDATE' and old.moderation_status = 'visible' then
    return null;
  end if;

  select author_id into post_author from public.club_posts where id = new.post_id;
  if new.parent_id is not null then
    select author_id into parent_author from public.club_comments where id = new.parent_id;
  end if;

  if parent_author is not null
    and parent_author <> new.author_id
    and not private.club_blocked_between(parent_author, new.author_id) then
    insert into public.club_activity(recipient_id, actor_id, kind, post_id, comment_id)
    values (parent_author, new.author_id, 'reply', new.post_id, new.id)
    on conflict do nothing;
  end if;

  if post_author is not null
    and post_author <> new.author_id
    and post_author is distinct from parent_author
    and not private.club_blocked_between(post_author, new.author_id) then
    insert into public.club_activity(recipient_id, actor_id, kind, post_id, comment_id)
    values (post_author, new.author_id, 'comment', new.post_id, new.id)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

drop trigger if exists club_comments_activity on public.club_comments;
create trigger club_comments_activity
after insert or update of moderation_status on public.club_comments
for each row execute function private.club_activity_for_comment();

-- A like tells the post's author once; taking it back takes the activity back.
create or replace function private.club_activity_for_reaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  post_author uuid;
begin
  if tg_op = 'DELETE' then
    delete from public.club_activity
    where kind = 'like' and actor_id = old.user_id and post_id = old.post_id;
    return null;
  end if;

  select author_id into post_author from public.club_posts where id = new.post_id;
  if post_author is null
    or post_author = new.user_id
    or private.club_blocked_between(post_author, new.user_id) then
    return null;
  end if;
  insert into public.club_activity(recipient_id, actor_id, kind, post_id)
  values (post_author, new.user_id, 'like', new.post_id)
  on conflict do nothing;
  return null;
end;
$$;

drop trigger if exists club_reactions_activity on public.club_reactions;
create trigger club_reactions_activity
after insert or delete on public.club_reactions
for each row execute function private.club_activity_for_reaction();

revoke execute on function private.club_comment_thread() from public, anon, authenticated;
revoke execute on function private.club_activity_for_comment() from public, anon, authenticated;
revoke execute on function private.club_activity_for_reaction() from public, anon, authenticated;

-- Opening the inbox marks everything in it read.
create or replace function public.mark_club_activity_read()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  marked integer;
begin
  if auth.uid() is null then
    raise exception 'Sign in to read your Club activity.' using errcode = '42501';
  end if;
  update public.club_activity set read_at = now()
  where recipient_id = auth.uid() and read_at is null;
  get diagnostics marked = row_count;
  return marked;
end;
$$;

revoke execute on function public.mark_club_activity_read() from public, anon;
grant execute on function public.mark_club_activity_read() to authenticated;

-- The app keeps its unread count live.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'club_activity'
    ) then
    alter publication supabase_realtime add table public.club_activity;
  end if;
end;
$$;


-- ---------------------------------------------------------------------------
-- Account erasure (latest in 202610060003), now with the activity.
-- ---------------------------------------------------------------------------
create or replace function public.erase_account_data(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_user_id is null then
    raise exception 'A user is required';
  end if;

  -- Media rows of the rider's posts. The posts themselves stay, redacted
  -- below, so threads other riders replied to keep their shape.
  delete from public.club_post_media
  where post_id in (select id from public.club_posts where author_id = target_user_id);

  -- Horses take their records, record files and collaborators with them.
  -- Other riders' rides on these horses keep their entry, without the horse.
  delete from public.horses where owner_id = target_user_id;
  -- Collaborations on other riders' horses.
  delete from public.horse_collaborators
  where user_id = target_user_id or invited_by = target_user_id;

  delete from public.ride_entries where rider_id = target_user_id;
  delete from public.academy_progress where user_id = target_user_id;
  delete from public.academy_lesson_picks where user_id = target_user_id;
  delete from public.plan_subscriptions where user_id = target_user_id;
  update public.plan_subscriptions set granted_by = null where granted_by = target_user_id;
  delete from public.beta_invites
  where email = (select lower(trim(account.email)) from auth.users account where account.id = target_user_id);
  update public.beta_invites set invited_by = null where invited_by = target_user_id;
  delete from public.onboarding_starter_packs where user_id = target_user_id;
  -- Messages, their operations and feedback cascade from the conversation.
  delete from public.coach_conversations where user_id = target_user_id;
  delete from public.coach_message_feedback where user_id = target_user_id;
  delete from public.coach_usage_events where user_id = target_user_id;
  delete from public.data_export_requests where user_id = target_user_id;
  delete from public.push_devices where user_id = target_user_id;
  delete from public.notification_outbox where recipient_id = target_user_id;
  delete from public.upload_tickets where user_id = target_user_id;
  delete from public.club_memberships where user_id = target_user_id;
  delete from public.club_reactions where user_id = target_user_id;
  -- What the rider was told about, and what others were told the rider did.
  delete from public.club_activity
  where recipient_id = target_user_id or actor_id = target_user_id;
  delete from public.saved_listings where user_id = target_user_id;
  delete from public.user_blocks
  where blocker_id = target_user_id or blocked_id = target_user_id;
  delete from public.user_preferences where user_id = target_user_id;
  delete from public.notification_preferences where user_id = target_user_id;
  delete from public.feature_flag_overrides where user_id = target_user_id;
  delete from public.user_roles where user_id = target_user_id;

  -- Redacted in place rather than deleted: other riders replied to them.
  -- moderate_club_post keeps 'deleted' when the body changes in the same update.
  update public.club_posts
  set body = '[Deleted by rider]', moderation_status = 'deleted'
  where author_id = target_user_id;
  update public.club_comments
  set body = '[Deleted by rider]', moderation_status = 'deleted'
  where author_id = target_user_id;
  update public.marketplace_messages
  set body = '[Deleted by rider]', deleted_at = now()
  where sender_id = target_user_id;

  update public.profiles
  set
    display_name = 'Deleted rider',
    avatar_path = null,
    location = null,
    discipline = null,
    skill_level = null,
    bio = null
  where id = target_user_id;
end;
$$;

commit;
