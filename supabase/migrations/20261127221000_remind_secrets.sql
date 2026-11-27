-- Secrets are generated inside the database / the remind function, never on a developer machine.
do $$
begin
  if not exists (select 1 from vault.secrets where name = 'remind_cron_secret') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'remind_cron_secret', 'Shared secret pg_cron to remind function');
  end if;
end $$;

-- The remind function creates its VAPID key pair on first run and stores it here (insert once).
create or replace function public.put_service_secret_once(secret_name text, secret_value text, secret_description text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if secret_name not in ('vapid_private_jwk') then
    raise exception 'not allowed';
  end if;
  if not exists (select 1 from vault.secrets where name = secret_name) then
    perform vault.create_secret(secret_value, secret_name, secret_description);
  end if;
end;
$$;
revoke all on function public.put_service_secret_once(text, text, text) from public, anon, authenticated;
grant execute on function public.put_service_secret_once(text, text, text) to service_role;
