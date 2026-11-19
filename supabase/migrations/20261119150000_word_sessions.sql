-- Words session (Word of the day): one row per user per day with the 5 picked words and step progress.
-- Learned words go to the existing phrases table with origin 'words'.

alter table public.phrases drop constraint if exists phrases_origin_check;
alter table public.phrases add constraint phrases_origin_check
  check (origin in ('answer', 'suggested', 'builder', 'listen', 'manual', 'words'));

create table if not exists public.word_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_date date not null,
  topic text not null default '',
  words jsonb not null default '[]'::jsonb,
  progress jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, session_date),
  constraint word_sessions_words_array check (jsonb_typeof(words) = 'array'),
  constraint word_sessions_progress_object check (jsonb_typeof(progress) = 'object')
);

alter table public.word_sessions enable row level security;

drop policy if exists "word_sessions select own" on public.word_sessions;
drop policy if exists "word_sessions insert own" on public.word_sessions;
drop policy if exists "word_sessions update own" on public.word_sessions;
drop policy if exists "word_sessions delete own" on public.word_sessions;
create policy "word_sessions select own" on public.word_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "word_sessions insert own" on public.word_sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "word_sessions update own" on public.word_sessions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "word_sessions delete own" on public.word_sessions for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.word_sessions from anon;
grant select, insert, update, delete on public.word_sessions to authenticated;
