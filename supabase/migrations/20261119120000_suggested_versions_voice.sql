-- Suggested-answer versions get their own table (no cap; each version deleted permanently on its own),
-- plus two voice settings: ask the question aloud, and Listening mode (hide the question text).
create table if not exists public.suggested_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  question_id uuid not null references public.daily_questions(id) on delete cascade,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists suggested_answers_user_question_idx on public.suggested_answers (user_id, question_id, created_at);
create index if not exists suggested_answers_question_idx on public.suggested_answers (question_id);

alter table public.suggested_answers enable row level security;
create policy "suggested_answers_select_own" on public.suggested_answers for select to authenticated using ((select auth.uid()) = user_id);
create policy "suggested_answers_insert_own" on public.suggested_answers for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (select 1 from public.daily_questions q where q.id = question_id and q.user_id = (select auth.uid())));
create policy "suggested_answers_update_own" on public.suggested_answers for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.daily_questions q where q.id = question_id and q.user_id = (select auth.uid())));
create policy "suggested_answers_delete_own" on public.suggested_answers for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.suggested_answers from anon;
grant select, insert, update, delete on public.suggested_answers to authenticated;

alter table public.user_settings add column if not exists ask_aloud boolean not null default true;
alter table public.user_settings add column if not exists listening_mode boolean not null default false;
