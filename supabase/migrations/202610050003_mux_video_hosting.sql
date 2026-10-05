begin;

-- Lesson videos move to Mux.
--
-- 202610030001 put lesson videos on Bunny Stream, and none was ever uploaded
-- there. For the launch Mux costs nothing: its free plan keeps ten videos
-- without a card, and with one, a monthly $20 credit covers storage for about
-- a hundred hours of lessons, with 100,000 minutes of viewing free each month.
-- Bunny stays a provider value with its signer; moving a lesson between hosts
-- is a re-upload, never an app change.
--
-- Staff upload from the admin straight to Mux (academy-video), and Mux reports
-- back through its signed webhook (mux-webhook). A Mux video has three ids
-- over its life, so the row grows two columns:
--   * upload_id   -- the direct upload the admin opened; every webhook event is
--                    matched on it, so news about an upload that was replaced
--                    since changes nothing;
--   * asset_id    -- the encoded video, once Mux has the file (null until then);
--   * playback_id -- what playback links point at. Bunny serves by asset id and
--                    leaves it null.

alter table public.academy_videos drop constraint academy_videos_provider_check;
alter table public.academy_videos
  add constraint academy_videos_provider_check check (provider in ('bunny', 'mux'));

alter table public.academy_videos alter column asset_id drop not null;

alter table public.academy_videos
  add column upload_id text check (upload_id is null or upload_id ~ '^[A-Za-z0-9]{1,100}$'),
  add column playback_id text check (playback_id is null or playback_id ~ '^[A-Za-z0-9]{1,100}$'),
  -- Mux's own words when an upload or encode fails, shown to staff.
  add column failure_reason text check (failure_reason is null or char_length(failure_reason) <= 300);

-- 'uploading': the admin has an upload URL and the file is on its way.
alter table public.academy_videos drop constraint academy_videos_status_check;
alter table public.academy_videos
  add constraint academy_videos_status_check check (status in ('uploading', 'processing', 'ready', 'failed'));

alter table public.academy_videos
  add constraint academy_videos_identified check (asset_id is not null or upload_id is not null),
  -- Ready means there is something to sign a link for.
  add constraint academy_videos_ready_is_playable check (
    status <> 'ready'
    or (provider = 'mux' and playback_id is not null)
    or (provider = 'bunny' and asset_id is not null)
  );

create unique index academy_videos_upload_idx on public.academy_videos(upload_id) where upload_id is not null;

-- ---------------------------------------------------------------------------
-- Who may watch what (202610030001), now naming the playback id too.
-- ---------------------------------------------------------------------------
-- The return type changes, so the function is replaced rather than redefined.
drop function public.academy_playback_source(uuid);

create function public.academy_playback_source(target_lesson uuid)
returns table (provider text, asset_id text, playback_id text, status text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  published boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in to watch lessons.' using errcode = '42501';
  end if;

  select lesson.published_at is not null into published
  from public.academy_lessons lesson
  where lesson.id = target_lesson;

  if published is null or (not published and not private.is_staff()) then
    raise exception 'Lesson not found.' using errcode = 'P0002';
  end if;

  return query
    select video.provider, video.asset_id, video.playback_id, video.status
    from public.academy_videos video
    where video.lesson_id = target_lesson;
end;
$$;

revoke all on function public.academy_playback_source(uuid) from public, anon;
grant execute on function public.academy_playback_source(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- May this session change this lesson's video?
-- ---------------------------------------------------------------------------
-- academy-video asks with the staff member's own session before it opens an
-- upload or removes a video, so the second-factor rule is the database's, as
-- everywhere else. A published lesson keeps its video: replacing it would
-- leave riders a lesson that cannot play until the new file is encoded.
create or replace function public.staff_prepare_lesson_video(target_lesson uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  published boolean;
begin
  if not private.is_staff() then
    raise exception 'Staff access required.' using errcode = '42501';
  end if;
  select lesson.published_at is not null into published
  from public.academy_lessons lesson
  where lesson.id = target_lesson;
  if published is null then
    raise exception 'Lesson not found.' using errcode = 'P0002';
  end if;
  if published then
    raise exception 'Unpublish the lesson before changing its video.' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.staff_prepare_lesson_video(uuid) from public, anon;
grant execute on function public.staff_prepare_lesson_video(uuid) to authenticated;

commit;
