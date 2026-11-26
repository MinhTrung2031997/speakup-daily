-- "Say it better" from Vietnamese: one row per session (his thought, the 3 versions, which one he picked, his graded retry).
-- The key phrase goes to the phrases table with origin 'say'.

alter table public.phrases drop constraint if exists phrases_origin_check;
alter table public.phrases add constraint phrases_origin_check
  check (origin in ('answer', 'suggested', 'builder', 'listen', 'manual', 'words', 'say'));

create table if not exists public.say_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_date date not null default current_date,
  input text not null check (length(input) between 1 and 1000),
  input_lang text not null default 'vi' check (input_lang in ('vi', 'en')),
  result jsonb not null,
  picked smallint check (picked between 0 and 2),
  shadowed boolean not null default false,
  grade jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint say_sessions_result_object check (jsonb_typeof(result) = 'object')
);
create index if not exists say_sessions_user_created_idx on public.say_sessions (user_id, created_at desc);

alter table public.say_sessions enable row level security;
drop policy if exists "say_sessions select own" on public.say_sessions;
drop policy if exists "say_sessions insert own" on public.say_sessions;
drop policy if exists "say_sessions update own" on public.say_sessions;
drop policy if exists "say_sessions delete own" on public.say_sessions;
create policy "say_sessions select own" on public.say_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "say_sessions insert own" on public.say_sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "say_sessions update own" on public.say_sessions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "say_sessions delete own" on public.say_sessions for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.say_sessions from anon;
grant select, insert, update, delete on public.say_sessions to authenticated;
