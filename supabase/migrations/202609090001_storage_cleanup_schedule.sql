begin;

-- Schedules the storage cleanup worker.
--
-- This job previously existed only as a manual `cron.schedule` call against the
-- hosted project. When that project was deleted the schedule was lost with it,
-- while every table and function came back from this directory. Keeping it here
-- makes the worker reproducible with the rest of the backend.
--
-- Two runtime prerequisites are NOT created by this migration, because neither
-- belongs in source control:
--
--   1. Vault secret `storage_automation_secret`, holding the same value as the
--      `STORAGE_AUTOMATION_SECRET` Edge Function secret. Until both match the
--      worker answers 401 and every run is a no-op.
--   2. The `process-storage-cleanup` function deployed to the project below.
--
-- The base URL is project-specific. On a re-provisioned project, update it here
-- rather than rescheduling by hand, so the next rebuild stays reproducible.

do $$
declare
  functions_base_url constant text :=
    'https://mvdxohyayriywbcknulg.supabase.co/functions/v1';
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise notice 'pg_cron is not installed; skipping storage cleanup schedule';
    return;
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise notice 'pg_net is not installed; skipping storage cleanup schedule';
    return;
  end if;

  -- cron.schedule replaces a job of the same name, so this stays idempotent.
  perform cron.schedule(
    'equina-storage-cleanup',
    '*/5 * * * *',
    format(
      $job$
      select net.http_post(
        url := %L,
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-equina-cron-secret', (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'storage_automation_secret'
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000
      );
      $job$,
      functions_base_url || '/process-storage-cleanup'
    )
  );
end;
$$;

commit;
