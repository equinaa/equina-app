begin;

-- Account deletion scheduling must pass through the Edge Function so recent
-- authentication, the grace period, and audit logging cannot be bypassed.
drop policy if exists deletion_request_create_self
  on public.account_deletion_requests;
drop policy if exists deletion_request_cancel_self
  on public.account_deletion_requests;

revoke insert, update on public.account_deletion_requests
  from authenticated;
grant select, insert, update, delete on public.account_deletion_requests
  to service_role;

-- Rollback: restore only after reintroducing equivalent recent-auth and audit
-- enforcement at the database boundary. Do not grant client mutation access as
-- an operational rollback.

commit;
