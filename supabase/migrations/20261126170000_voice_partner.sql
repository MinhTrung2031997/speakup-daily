-- Voice conversation partner (Chat tab): role-play scenes and the Discord group, plus the Story bank.
-- Target phrases he used go to the phrases table with origin 'roleplay' (scenes / Discord) or 'story' (Story bank).
alter table public.phrases drop constraint if exists phrases_origin_check;
alter table public.phrases add constraint phrases_origin_check
  check (origin in ('answer', 'suggested', 'builder', 'listen', 'manual', 'words', 'say', 'roleplay', 'story'));

-- One row per role-play / Discord session. turns = [{role:'ai'|'user', speaker?, text, missed?}], feedback = rolePlayFeedback JSON.
create table if not exists public.partner_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_date date not null default current_date,
  kind text not null check (kind in ('scene', 'discord')),
  ref text not null default '' check (length(ref) <= 120),
  title text not null default '' check (length(title) <= 200),
  voice_only boolean not null default false,
  turns jsonb not null default '[]'::jsonb,
  feedback jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint partner_sessions_turns_array check (jsonb_typeof(turns) = 'array')
);
create index if not exists partner_sessions_user_created_idx on public.partner_sessions (user_id, created_at);

-- Story bank: one row per story slot (10 slots), reopened and retold any time.
create table if not exists public.story_bank (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slot_id text not null check (length(slot_id) between 1 and 60),
  transcript text not null default '' check (length(transcript) <= 6000),
  polished text not null default '' check (length(polished) <= 4000),
  structure text not null default '' check (length(structure) <= 300),
  phrases_to_keep jsonb not null default '[]'::jsonb,
  beats jsonb not null default '[]'::jsonb,
  retell text not null default '' check (length(retell) <= 6000),
  retell_check jsonb,
  retells integer not null default 0 check (retells >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, slot_id),
  constraint story_bank_arrays check (jsonb_typeof(phrases_to_keep) = 'array' and jsonb_typeof(beats) = 'array')
);

do $$
declare t text;
begin
  foreach t in array array['partner_sessions', 'story_bank'] loop
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
