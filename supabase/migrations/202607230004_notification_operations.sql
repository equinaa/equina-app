begin;

create or replace function public.claim_notification_outbox(batch_size integer default 25)
returns setof public.notification_outbox
language plpgsql
security definer
set search_path = ''
as $$
begin
  if batch_size < 1 or batch_size > 100 then raise exception 'Batch size is invalid'; end if;
  return query
  update public.notification_outbox o
  set status = 'processing', attempts = attempts + 1
  where o.id in (
    select candidate.id
    from public.notification_outbox candidate
    where candidate.status in ('pending', 'retry')
      and candidate.next_attempt_at <= now()
    order by candidate.id
    for update skip locked
    limit batch_size
  )
  returning o.*;
end;
$$;

revoke execute on function public.claim_notification_outbox(integer)
from public, anon, authenticated;
grant execute on function public.claim_notification_outbox(integer)
to service_role;

commit;
