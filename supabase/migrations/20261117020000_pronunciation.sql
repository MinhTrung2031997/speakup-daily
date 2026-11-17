-- Pronunciation feedback from recorded audio.
-- 1. Results stored next to the attempt they belong to (nullable, additive; existing RLS applies).
alter table public.answers add column if not exists pronunciation jsonb;            -- the spoken answer (builder: the "say it your way" try)
alter table public.listening_sessions add column if not exists pronunciation jsonb; -- the 60s retell
alter table public.shadowing_attempts add column if not exists pronunciation jsonb; -- one shadowing take

-- 2. "Sounds to fix": problem words that come back in reviews (spaced repetition like phrases).
create table public.pronunciation_items (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  word        text not null check (char_length(word) between 1 and 80),
  note        text not null default '',
  ipa         text not null default '',
  issue       text not null default '',
  heard       text not null default '',
  times_seen  integer not null default 1 check (times_seen >= 0),
  last_seen   date not null default current_date,
  stage       smallint not null default 0 check (stage between 0 and 5),
  next_review date not null default (current_date + 1),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index pronunciation_items_user_word_key on public.pronunciation_items (user_id, lower(word));
create index pronunciation_items_user_review_idx on public.pronunciation_items (user_id, next_review);

create trigger set_updated_at before update on public.pronunciation_items for each row execute function public.set_updated_at();
alter table public.pronunciation_items enable row level security;
revoke all on public.pronunciation_items from anon;
grant select, insert, update, delete on public.pronunciation_items to authenticated;
create policy "Users can read own pronunciation_items" on public.pronunciation_items for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users can insert own pronunciation_items" on public.pronunciation_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Users can update own pronunciation_items" on public.pronunciation_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Users can delete own pronunciation_items" on public.pronunciation_items for delete to authenticated using ((select auth.uid()) = user_id);
