-- Today's plan, answer reviews on a 1/3/7/21-day schedule, reminders with Web Push.

create table if not exists public.daily_plans (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_date date not null,
  items jsonb not null default '[]'::jsonb,
  light boolean not null default false,
  question text,
  streak integer not null default 0,
  question_done boolean not null default false,
  reviews_done boolean not null default false,
  streak_day boolean not null default false,
  left_text text,
  left_mins integer not null default 0,
  reviews_left integer not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, plan_date),
  constraint daily_plans_items_array check (jsonb_typeof(items) = 'array')
);

create table if not exists public.answer_reviews (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  answer_id uuid not null references public.answers (id) on delete cascade,
  due_at date not null,
  interval_step smallint not null default 0 check (interval_step between 0 and 4),
  last_result text not null default 'new' check (last_result in ('new', 'better', 'same', 'worse')),
  last_reviewed_on date,
  reviews integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, answer_id)
);
create index if not exists answer_reviews_due_idx on public.answer_reviews (user_id, due_at);

create table if not exists public.reminder_settings (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  enabled boolean not null default false,
  remind_time text not null default '20:00' check (remind_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  days smallint[] not null default '{0,1,2,3,4,5,6}',
  timezone text not null default 'Asia/Saigon' check (length(timezone) between 1 and 64),
  evening boolean not null default true,
  evening_time text not null default '21:30' check (evening_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  updated_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://'),
  p256dh text not null,
  auth text not null,
  user_agent text,
  failures integer not null default 0,
  last_ok_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table if not exists public.push_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  local_date date not null,
  kind text not null check (kind in ('main', 'evening', 'test')),
  title text,
  body text,
  sent integer not null default 0,
  status text,
  created_at timestamptz not null default now()
);
create unique index if not exists push_log_once_per_day on public.push_log (user_id, local_date, kind) where kind <> 'test';

-- RLS: own rows only. push_log is read-only for the user (the server writes it).
do $$
declare t text;
begin
  foreach t in array array['daily_plans', 'answer_reviews', 'reminder_settings', 'push_subscriptions'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s select own" on public.%I', t, t);
    execute format('drop policy if exists "%s insert own" on public.%I', t, t);
    execute format('drop policy if exists "%s update own" on public.%I', t, t);
    execute format('drop policy if exists "%s delete own" on public.%I', t, t);
    execute format('create policy "%s select own" on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t, t);
    execute format('create policy "%s insert own" on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t, t);
    execute format('create policy "%s update own" on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t, t);
    execute format('create policy "%s delete own" on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t, t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

alter table public.push_log enable row level security;
drop policy if exists "push_log select own" on public.push_log;
create policy "push_log select own" on public.push_log for select to authenticated using ((select auth.uid()) = user_id);
revoke all on public.push_log from anon, authenticated;
grant select on public.push_log to authenticated;

-- Backfill: every existing daily answer (not builder, not a Replay redo) gets a review, due the day after it was answered.
insert into public.answer_reviews (user_id, answer_id, due_at)
select a.user_id, a.id, a.answer_date + 1
from public.answers a
where a.builder is null and a.replay is null
on conflict do nothing;

-- Server-only secret reader for the remind function (VAPID key, cron secret live in Vault).
create or replace function public.get_service_secret(secret_name text)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret from vault.decrypted_secrets where name = secret_name limit 1;
$$;
revoke all on function public.get_service_secret(text) from public, anon, authenticated;
grant execute on function public.get_service_secret(text) to service_role;

create extension if not exists pg_net;
create extension if not exists pg_cron;
