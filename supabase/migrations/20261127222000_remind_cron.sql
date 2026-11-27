-- Every 15 minutes pg_cron calls the remind function with the Vault cron secret (pg_net, async).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'speakup-remind') then
    perform cron.unschedule('speakup-remind');
  end if;
end $$;

select cron.schedule(
  'speakup-remind',
  '*/15 * * * *',
  $job$
  select net.http_post(
    url := 'https://rnyigruvrotranrxtmed.supabase.co/functions/v1/remind',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'remind_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);
