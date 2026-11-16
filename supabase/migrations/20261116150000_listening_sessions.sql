-- Listen tab: one row per listening drill (dialogue + questions + dictation + retell).
create table public.listening_sessions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  topic              text not null default '',
  accent             text not null default 'US' check (accent in ('US', 'UK')),
  speed              numeric(3, 2) not null default 1 check (speed between 0.5 and 2),
  level              text not null default 'Natural',
  drill              jsonb not null,                 -- ListenDrill: title, lines, questions, dictation, keyIdeas, phrases
  answers            jsonb,                          -- chosen option index per question
  question_score     smallint check (question_score between 0 and 3),
  dictation_text     text,
  dictation_accuracy smallint check (dictation_accuracy between 0 and 100),
  retell             jsonb,                          -- RetellResult (+ the learner's retell text)
  retell_score       smallint check (retell_score between 0 and 100),
  session_date       date not null default current_date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index listening_sessions_user_created_idx on public.listening_sessions (user_id, created_at desc);

create trigger set_updated_at before update on public.listening_sessions for each row execute function public.set_updated_at();
alter table public.listening_sessions enable row level security;
revoke all on public.listening_sessions from anon;
grant select, insert, update, delete on public.listening_sessions to authenticated;
create policy "Users can read own listening_sessions" on public.listening_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own listening_sessions" on public.listening_sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own listening_sessions" on public.listening_sessions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own listening_sessions" on public.listening_sessions for delete to authenticated using ((select auth.uid()) = user_id);
