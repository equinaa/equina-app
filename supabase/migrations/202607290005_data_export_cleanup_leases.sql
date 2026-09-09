begin;

alter table public.data_export_requests
  add column cleanup_status text not null default 'pending'
    check (cleanup_status in ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
  add column cleanup_attempts smallint not null default 0
    check (cleanup_attempts between 0 and 20),
  add column next_cleanup_at timestamptz not null default now(),
  add column cleanup_lease_token uuid,
  add column cleanup_lease_expires_at timestamptz,
  add column cleanup_started_at timestamptz,
  add column cleanup_error_code text
    check (cleanup_error_code is null or char_length(cleanup_error_code) <= 80);

create index data_export_cleanup_work_idx
on public.data_export_requests(next_cleanup_at, expires_at, id)
where status = 'ready'
  and cleanup_status in ('pending', 'processing', 'failed')
  and cleanup_attempts < 20;

grant select, insert, update, delete on public.data_export_requests to service_role;

create or replace function public.claim_data_export_cleanup(
  batch_size integer default 100,
  lease_seconds integer default 300
)
returns setof public.data_export_requests
language plpgsql
security definer
set search_path = ''
as $$
begin
  if batch_size < 1 or batch_size > 200 then raise exception 'Batch size is invalid'; end if;
  if lease_seconds < 30 or lease_seconds > 3600 then raise exception 'Lease duration is invalid'; end if;

  return query
  update public.data_export_requests request
  set
    cleanup_status = 'processing',
    cleanup_attempts = request.cleanup_attempts + 1,
    cleanup_lease_token = gen_random_uuid(),
    cleanup_lease_expires_at = now() + make_interval(secs => lease_seconds),
    cleanup_started_at = now(),
    cleanup_error_code = null
  where request.id in (
    select candidate.id
    from public.data_export_requests candidate
    where candidate.status = 'ready'
      and candidate.expires_at <= now()
      and candidate.next_cleanup_at <= now()
      and candidate.cleanup_attempts < 20
      and (
        candidate.cleanup_status in ('pending', 'failed')
        or (
          candidate.cleanup_status = 'processing'
          and candidate.cleanup_lease_expires_at is not null
          and candidate.cleanup_lease_expires_at <= now()
        )
      )
    order by candidate.next_cleanup_at, candidate.expires_at, candidate.id
    for update skip locked
    limit batch_size
  )
  returning request.*;
end;
$$;

create or replace function public.complete_data_export_cleanup(
  target_request_id uuid,
  job_lease_token uuid
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with completed as (
    update public.data_export_requests request
    set
      status = 'expired',
      object_path = null,
      cleanup_status = 'completed',
      cleanup_lease_token = null,
      cleanup_lease_expires_at = null,
      cleanup_error_code = null
    where request.id = target_request_id
      and request.status = 'ready'
      and request.cleanup_status = 'processing'
      and request.cleanup_lease_token = job_lease_token
      and request.cleanup_lease_expires_at > now()
    returning 1
  )
  select exists(select 1 from completed);
$$;

create or replace function public.fail_data_export_cleanup(
  target_request_id uuid,
  job_lease_token uuid,
  error_code text default 'export_cleanup_failed'
)
returns boolean
language sql
security definer
set search_path = ''
as $$
  with failed as (
    update public.data_export_requests request
    set
      cleanup_status = case
        when request.cleanup_attempts >= 20 then 'dead_letter'
        else 'failed'
      end,
      next_cleanup_at = now() + make_interval(
        secs => least(86400, 300 * power(2, least(request.cleanup_attempts, 8))::integer)
      ),
      cleanup_lease_token = null,
      cleanup_lease_expires_at = null,
      cleanup_error_code = left(
        coalesce(nullif(error_code, ''), 'export_cleanup_failed'),
        80
      )
    where request.id = target_request_id
      and request.status = 'ready'
      and request.cleanup_status = 'processing'
      and request.cleanup_lease_token = job_lease_token
    returning 1
  )
  select exists(select 1 from failed);
$$;

revoke execute on function public.claim_data_export_cleanup(integer, integer)
from public, anon, authenticated;
revoke execute on function public.complete_data_export_cleanup(uuid, uuid)
from public, anon, authenticated;
revoke execute on function public.fail_data_export_cleanup(uuid, uuid, text)
from public, anon, authenticated;

grant execute on function public.claim_data_export_cleanup(integer, integer)
to service_role;
grant execute on function public.complete_data_export_cleanup(uuid, uuid)
to service_role;
grant execute on function public.fail_data_export_cleanup(uuid, uuid, text)
to service_role;

commit;
