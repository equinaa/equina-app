begin;

create table public.storage_cleanup_jobs (
  id bigint generated always as identity primary key,
  bucket_id text not null,
  object_path text not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  attempts smallint not null default 0 check (attempts between 0 and 20),
  next_attempt_at timestamptz not null default now(),
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (bucket_id, object_path)
);
create index storage_cleanup_pending_idx on public.storage_cleanup_jobs(next_attempt_at, id)
where status in ('pending', 'failed') and attempts < 20;

alter table public.storage_cleanup_jobs enable row level security;
revoke all on public.storage_cleanup_jobs from public, anon, authenticated;

drop policy horse_media_delete_owner on storage.objects;
drop policy horse_records_delete_owner on storage.objects;
drop policy club_media_delete_owner on storage.objects;
drop policy listing_media_delete_owner on storage.objects;
drop policy dispute_evidence_delete_owner on storage.objects;

commit;
