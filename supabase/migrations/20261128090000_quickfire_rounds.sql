-- Reply speed meter (quick-fire): one row per 8-question round; answer audio goes to the private
-- `recordings` bucket as kind 'quickfire' (best + worst answer of each round).

create table if not exists public.quickfire_rounds (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  round_date date not null,
  level text not null default 'easy' check (level in ('easy', 'open')),
  start_limit numeric(3,1) not null default 3 check (start_limit between 1 and 10),
  avg_start numeric(5,2),
  fillers_per_min numeric(6,2),
  longest_pause numeric(5,2),
  misses smallint not null default 0 check (misses between 0 and 8),
  answers jsonb not null default '[]'::jsonb,
  best_index smallint,
  worst_index smallint,
  filler_source text not null default 'chrome' check (filler_source in ('gemini', 'chrome', 'mixed')),
  created_at timestamptz not null default now(),
  constraint quickfire_answers_array check (jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) <= 12)
);
create index if not exists quickfire_rounds_user_idx on public.quickfire_rounds (user_id, created_at desc);

alter table public.quickfire_rounds enable row level security;
drop policy if exists "quickfire_rounds select own" on public.quickfire_rounds;
drop policy if exists "quickfire_rounds insert own" on public.quickfire_rounds;
drop policy if exists "quickfire_rounds update own" on public.quickfire_rounds;
drop policy if exists "quickfire_rounds delete own" on public.quickfire_rounds;
create policy "quickfire_rounds select own" on public.quickfire_rounds for select to authenticated using ((select auth.uid()) = user_id);
create policy "quickfire_rounds insert own" on public.quickfire_rounds for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "quickfire_rounds update own" on public.quickfire_rounds for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "quickfire_rounds delete own" on public.quickfire_rounds for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.quickfire_rounds from anon;
grant select, insert, update, delete on public.quickfire_rounds to authenticated;

-- Allow the new recording kind.
alter table public.recordings drop constraint if exists recordings_kind_check;
alter table public.recordings add constraint recordings_kind_check check (kind in ('answer', 'retry', 'builder', 'retell', 'shadowing', 'quickfire'));
