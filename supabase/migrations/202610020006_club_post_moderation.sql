begin;

-- Club switches to post-moderation.
--
-- Until now every post and comment landed as 'pending' and waited for
-- process-content-moderation to approve it. That worker needs an external
-- moderation provider that is not configured, so nothing anyone wrote was ever
-- shown to anyone else. Decided for launch: content is visible as soon as it
-- is written, and three safeguards stand in for the review queue. App Store
-- guideline 1.2 asks for each of them:
--
--   * a filter: content matching the phrase list below is hidden on write;
--   * reports: three different riders reporting the same post or comment hide
--     it until staff look at it;
--   * blocking: neither side sees the other's posts (already true) or comments
--     (new here).
--
-- Moderation jobs are still queued for every post and comment, so the provider
-- can be switched on after launch and work through what was written meanwhile.

-- The filter. Phrases, not words: a word list hides "ride the line" for
-- containing something it matched. Deliberately short until the moderation
-- API replaces it.
create or replace function private.club_content_status(content text)
returns public.content_status
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(content) ~ '(ignore the vet|colic cure|laminitis cure|animal abuse|buy followers|crypto investment|\mkill yourself\M|\mkys\M)'
      then 'hidden'::public.content_status
    else 'visible'::public.content_status
  end;
$$;

-- An edit never lifts a hide. Under pre-moderation an edit went back to the
-- queue; now it would be re-screened by the filter alone, and retyping a
-- reported post would republish it.
create or replace function private.moderate_club_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.moderation_status = 'deleted' then
    new.edited_at = now();
    return new;
  end if;
  if tg_op = 'INSERT' or new.body is distinct from old.body then
    if tg_op = 'UPDATE' and old.moderation_status = 'hidden' then
      new.moderation_status = 'hidden';
    else
      new.moderation_status = private.club_content_status(new.body);
    end if;
    if tg_op = 'UPDATE' then new.edited_at = now(); end if;
  end if;
  return new;
end;
$$;

-- Three distinct reporters hide a post or comment. Staff can restore it.
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
    from public.content_reports where post_id = new.post_id;
    if reporters >= 3 then
      update public.club_posts set moderation_status = 'hidden'
      where id = new.post_id and moderation_status = 'visible';
    end if;
  elsif new.comment_id is not null then
    select count(distinct reporter_id) into reporters
    from public.content_reports where comment_id = new.comment_id;
    if reporters >= 3 then
      update public.club_comments set moderation_status = 'hidden'
      where id = new.comment_id and moderation_status = 'visible';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists content_reports_hide_reported on public.content_reports;
create trigger content_reports_hide_reported
after insert on public.content_reports
for each row execute function private.hide_reported_club_content();

-- Blocking hides comments too, in both directions, as it already did posts.
drop policy if exists comments_read on public.club_comments;
create policy comments_read on public.club_comments for select to authenticated
using (
  (author_id = auth.uid() or private.is_staff() or moderation_status = 'visible')
  and exists (select 1 from public.club_posts p where p.id = post_id)
  and not exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = author_id)
       or (b.blocker_id = author_id and b.blocked_id = auth.uid())
  )
);

commit;
