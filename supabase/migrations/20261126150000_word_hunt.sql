-- Word tracker: daily target words ("try to use"), how each answer used them (graded by the AI, counted in code),
-- and cached better-word swaps for overused words. A word is "active" after Natural uses in 3 different answers.

create table if not exists public.word_hunt_days (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  hunt_date date not null,
  targets jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, hunt_date),
  constraint word_hunt_days_targets_array check (jsonb_typeof(targets) = 'array')
);

create table if not exists public.word_hunt_uses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  hunt_date date not null,
  phrase text not null check (length(phrase) between 1 and 200),
  answer_ref text not null check (length(answer_ref) between 1 and 100),
  source text not null default 'daily' check (source in ('daily', 'retry', 'replay', 'builder', 'say', 'words')),
  level text not null check (level in ('natural', 'forced', 'misused', 'absent')),
  evidence text not null default '',
  note text not null default '',
  better text not null default '',
  question text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, answer_ref, phrase)
);
create index if not exists word_hunt_uses_user_phrase_idx on public.word_hunt_uses (user_id, phrase);

create table if not exists public.overused_swaps (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  word text not null check (length(word) between 1 and 60),
  swaps jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, word),
  constraint overused_swaps_array check (jsonb_typeof(swaps) = 'array')
);

do $$
declare t text;
begin
  foreach t in array array['word_hunt_days', 'word_hunt_uses', 'overused_swaps'] loop
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
