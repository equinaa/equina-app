begin;

-- Schedules the account deletion worker.
--
-- Deleting an account from inside the app is an App Store requirement
-- (guideline 5.1.1(v)), and a request that is accepted but never carried out is
-- worse than no button at all: the rider is told their data is going and it
-- stays. schedule-account-deletion only records the request, fourteen days out;
-- this job is what acts on it.
--
-- Hourly is plenty. Every request sits in a fourteen-day window, so the worker
-- never races the rider, and a run that finds nothing due is a cheap no-op.
--
-- Two runtime prerequisites are NOT created here, because neither belongs in
-- source control -- the same pair the storage cleanup job needs:
--
--   1. Vault secret `account_automation_secret`, holding the same value as the
--      `ACCOUNT_AUTOMATION_SECRET` Edge Function secret. Until both match the
--      worker answers 401 and every run is a no-op. This mismatch has already
--      happened once on this project with the storage worker; check
--      vault.decrypted_secrets.updated_at after setting it.
--   2. The `process-account-deletions` function deployed to the project below.

do $$
declare
  functions_base_url constant text :=
    'https://mvdxohyayriywbcknulg.supabase.co/functions/v1';
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed; skipping account deletion schedule';
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net is not installed; skipping account deletion schedule';
    return;
  end if;

  -- cron.schedule replaces a job of the same name, so this stays idempotent.
  perform cron.schedule(
    'equina-account-deletions',
    '17 * * * *',
    format(
      $job$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          -- x-automation-secret, NOT the x-equina-cron-secret the storage job
          -- sends. The workers disagree on the header name (three each), and a
          -- wrong header is a silent 401 on every run. A contract test now
          -- checks every scheduled worker against the header it reads.
          'x-automation-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'account_automation_secret'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000
      );
      $job$,
      functions_base_url || '/process-account-deletions'
    )
  );
end;
$$;

commit;
