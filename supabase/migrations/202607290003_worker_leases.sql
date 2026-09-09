begin;

alter table public.storage_cleanup_jobs
  drop constraint if exists storage_cleanup_jobs_status_check;
alter table public.storage_cleanup_jobs
  add constraint storage_cleanup_jobs_status_check
  check (status in ('pending', 'processing', 'completed', 'failed', 'dead_letter'));
alter table public.storage_cleanup_jobs
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column processing_started_at timestamptz;

alter table public.content_moderation_jobs
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column processing_started_at timestamptz;

alter table public.notification_outbox
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column processing_started_at timestamptz;

alter table public.account_deletion_requests
  add column attempts smallint not null default 0 check (attempts between 0 and 20),
  add column next_attempt_at timestamptz not null default now(),
  add column lease_token uuid,
  add column lease_expires_at timestamptz,
  add column processing_started_at timestamptz,
  add column last_error_code text check (last_error_code is null or char_length(last_error_code) <= 80);

create index account_deletion_work_idx
on public.account_deletion_requests(next_attempt_at, scheduled_for, id)
where canceled_at is null and completed_at is null and attempts < 20;

grant select, insert, update, delete on public.storage_cleanup_jobs to service_role;
grant select, insert, update, delete on public.content_moderation_jobs to service_role;
grant select, insert, update, delete on public.notification_outbox to service_role;
grant select, insert, update, delete on public.account_deletion_requests to service_role;

create or replace function public.claim_storage_cleanup_jobs(
  batch_size integer default 100,
  lease_seconds integer default 300
)
returns setof public.storage_cleanup_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  if batch_size < 1 or batch_size > 200 then raise exception 'Batch size is invalid'; end if;
  if lease_seconds < 30 or lease_seconds > 3600 then raise exception 'Lease duration is invalid'; end if;

  return query
  update public.storage_cleanup_jobs job
  set
    status = 'processing',
    attempts = job.attempts + 1,
    lease_token = gen_random_uuid(),
    lease_expires_at = now() + make_interval(secs => lease_seconds),
    processing_started_at = now(),
    last_error = null
  where job.id in (
    select candidate.id
    from public.storage_cleanup_jobs candidate
    where candidate.attempts < 20
      and candidate.next_attempt_at <= now()
      and (
        candidate.status in ('pending', 'failed')
        or (
          candidate.status = 'processing'
          and candidate.lease_expires_at is not null
          and candidate.lease_expires_at <= now()
        )
      )
    order by candidate.next_attempt_at, candidate.id
    for update skip locked
    limit batch_size
  )
  returning job.*;
end;
$$;

create or replace function public.complete_storage_cleanup_job(
  job_id bigint,
  job_lease_token uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with completed as (
    update public.storage_cleanup_jobs job
    set
      status = 'completed',
      completed_at = now(),
      lease_token = null,
      lease_expires_at = null,
      last_error = null
    where job.id = job_id
      and job.status = 'processing'
      and job.lease_token = job_lease_token
      and job.lease_expires_at > now()
    returning 1
  )
  select exists(select 1 from completed);
$$;

create or replace function public.fail_storage_cleanup_job(
  job_id bigint,
  job_lease_token uuid,
  error_code text default 'storage_removal_failed'
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with failed as (
    update public.storage_cleanup_jobs job
    set
      status = case when job.attempts >= 20 then 'dead_letter' else 'failed' end,
      next_attempt_at = now() + make_interval(
        secs => least(86400, 300 * power(2, least(job.attempts, 8))::integer)
      ),
      lease_token = null,
      lease_expires_at = null,
      last_error = left(coalesce(nullif(error_code, ''), 'storage_removal_failed'), 1000)
    where job.id = job_id
      and job.status = 'processing'
      and job.lease_token = job_lease_token
    returning 1
  )
  select exists(select 1 from failed);
$$;

create or replace function public.claim_content_moderation_jobs(
  batch_size integer default 20,
  lease_seconds integer default 300
)
returns setof public.content_moderation_jobs
language plpgsql
security definer
set search_path = ''
as $$
begin
  if batch_size < 1 or batch_size > 100 then raise exception 'Batch size is invalid'; end if;
  if lease_seconds < 30 or lease_seconds > 3600 then raise exception 'Lease duration is invalid'; end if;
  return query
  update public.content_moderation_jobs job
  set
    status = 'processing',
    attempts = job.attempts + 1,
    lease_token = gen_random_uuid(),
    lease_expires_at = now() + make_interval(secs => lease_seconds),
    processing_started_at = now(),
    last_error = null
  where job.id in (
    select candidate.id
    from public.content_moderation_jobs candidate
    where candidate.attempts < 20
      and candidate.next_attempt_at <= now()
      and (
        candidate.status in ('pending', 'failed')
        or (
          candidate.status = 'processing'
          and candidate.lease_expires_at is not null
          and candidate.lease_expires_at <= now()
        )
      )
    order by candidate.next_attempt_at, candidate.id
    for update skip locked
    limit batch_size
  )
  returning job.*;
end;
$$;

create or replace function public.claim_notification_outbox(batch_size integer default 25)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  if batch_size < 1 or batch_size > 100 then raise exception 'Batch size is invalid'; end if;
  return query
  update public.notification_outbox item
  set
    status = 'processing',
    attempts = item.attempts + 1,
    lease_token = gen_random_uuid(),
    lease_expires_at = now() + interval '5 minutes',
    processing_started_at = now()
  where item.id in (
    select candidate.id
    from public.notification_outbox candidate
    where candidate.attempts < 20
      and candidate.next_attempt_at <= now()
      and (
        candidate.status in ('pending', 'retry')
        or (
          candidate.status = 'processing'
          and candidate.lease_expires_at is not null
          and candidate.lease_expires_at <= now()
        )
      )
    order by candidate.next_attempt_at, candidate.id
    for update skip locked
    limit batch_size
  )
  returning item.*;
end;
$$;

create or replace function public.claim_account_deletions(
  batch_size integer default 25,
  lease_seconds integer default 900
)
returns setof public.account_deletion_requests
language plpgsql
security definer
set search_path = ''
as $$
begin
  if batch_size < 1 or batch_size > 50 then raise exception 'Batch size is invalid'; end if;
  if lease_seconds < 60 or lease_seconds > 3600 then raise exception 'Lease duration is invalid'; end if;
  return query
  update public.account_deletion_requests request
  set
    attempts = request.attempts + 1,
    lease_token = gen_random_uuid(),
    lease_expires_at = now() + make_interval(secs => lease_seconds),
    processing_started_at = now(),
    last_error_code = null
  where request.id in (
    select candidate.id
    from public.account_deletion_requests candidate
    where candidate.scheduled_for <= now()
      and candidate.next_attempt_at <= now()
      and candidate.canceled_at is null
      and candidate.completed_at is null
      and candidate.attempts < 20
      and (candidate.lease_expires_at is null or candidate.lease_expires_at <= now())
    order by candidate.scheduled_for, candidate.id
    for update skip locked
    limit batch_size
  )
  returning request.*;
end;
$$;

revoke execute on function public.claim_storage_cleanup_jobs(integer, integer) from public, anon, authenticated;
revoke execute on function public.complete_storage_cleanup_job(bigint, uuid) from public, anon, authenticated;
revoke execute on function public.fail_storage_cleanup_job(bigint, uuid, text) from public, anon, authenticated;
revoke execute on function public.claim_content_moderation_jobs(integer, integer) from public, anon, authenticated;
revoke execute on function public.claim_notification_outbox(integer) from public, anon, authenticated;
revoke execute on function public.claim_account_deletions(integer, integer) from public, anon, authenticated;

grant execute on function public.claim_storage_cleanup_jobs(integer, integer) to service_role;
grant execute on function public.complete_storage_cleanup_job(bigint, uuid) to service_role;
grant execute on function public.fail_storage_cleanup_job(bigint, uuid, text) to service_role;
grant execute on function public.claim_content_moderation_jobs(integer, integer) to service_role;
grant execute on function public.claim_notification_outbox(integer) to service_role;
grant execute on function public.claim_account_deletions(integer, integer) to service_role;

commit;
