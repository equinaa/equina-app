begin;

-- Lesson videos live with a video host, not in Storage.
--
-- 202609280001 gave each lesson a `video_path` in private Storage. That cannot
-- carry a lesson: the Free plan caps one upload at 50 MB, which a ten-minute
-- lesson in 1080p passes, and even on Pro Storage serves the one file it was
-- given. A rider watching on 4G at the yard needs the stream to drop to a
-- lower quality instead of stalling, which takes a host that encodes every
-- upload into several qualities and serves them as HLS.
--
-- The host is Bunny Stream for now. Which host holds a video is data on the
-- row, and every link is minted in one place (academy-playback), so a second
-- host -- Cloudflare Stream is the one to evaluate -- is a new provider value
-- and a second signer, with nothing in the app or the admin changing.
--
-- The catalogue is public product information and anon can read it, so the
-- host's asset id does not live there. It sits in its own table that only
-- staff can read, and riders reach a video only through a link that the
-- server signs and that expires.

alter table public.academy_lessons drop column video_path;

create table public.academy_videos (
  lesson_id uuid primary key references public.academy_lessons(id) on delete cascade,
  provider text not null check (provider in ('bunny')),
  -- The host's own id for the upload, e.g. Bunny's video GUID. It names a
  -- directory in signed URLs, so it is held to a strict shape here rather
  -- than trusted at signing time alone.
  asset_id text not null check (asset_id ~ '^[A-Za-z0-9][A-Za-z0-9-]{0,99}$'),
  -- Written by the host's webhook, never by hand: a video is ready when the
  -- host says it finished encoding, not when someone believes it did.
  status text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, asset_id)
);

create trigger academy_videos_set_updated_at
before update on public.academy_videos
for each row execute function private.set_updated_at();

alter table public.academy_videos enable row level security;

-- Staff see upload state in the admin. Every write comes from an edge
-- function holding the host's API key, so clients get no write at all.
create policy academy_videos_staff_read on public.academy_videos
for select to authenticated using (private.is_staff());

revoke all on public.academy_videos from public, anon, authenticated;
grant select on public.academy_videos to authenticated;
grant select, insert, update, delete on public.academy_videos to service_role;

-- ---------------------------------------------------------------------------
-- Who may watch what.
-- ---------------------------------------------------------------------------
-- academy-playback calls this with the rider's own session, so auth.uid() is
-- the rider asking. It answers with the host and asset to sign, or raises.
--
-- A draft answers exactly like a lesson that does not exist, except to staff
-- previewing it in the admin: a rider learns nothing about unpublished work.
--
-- Free and paid lessons are both open to every signed-in rider for now. The
-- launch has no paywall (the founding phase), so `access` is recorded but not
-- enforced yet. When Plus exists, a paid lesson checks the rider's
-- entitlement here, and nowhere else.
create or replace function public.academy_playback_source(target_lesson uuid)
returns table (provider text, asset_id text, status text)
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
    select video.provider, video.asset_id, video.status
    from public.academy_videos video
    where video.lesson_id = target_lesson;
end;
$$;

revoke all on function public.academy_playback_source(uuid) from public, anon;
grant execute on function public.academy_playback_source(uuid) to authenticated;

commit;
