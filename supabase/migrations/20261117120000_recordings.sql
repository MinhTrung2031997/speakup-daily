-- Saved answer recordings (kept permanently; ⭐ starred = favourites). Audio lives in the private
-- `recordings` bucket under '<user_id>/...' (bucket + storage RLS from 20261116123202).
-- One row per mic clip, linked loosely to what it belongs to (no FKs: rows sync independently).
create table if not exists public.recordings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('answer', 'retry', 'builder', 'retell', 'shadowing')),
  answer_id uuid,
  question_id uuid,
  listening_id uuid,
  question_type text,
  path text not null,
  mime_type text not null default 'audio/webm',
  duration_seconds numeric(7, 2) not null default 0 check (duration_seconds >= 0),
  bytes integer not null default 0 check (bytes >= 0),
  starred boolean not null default false,
  created_at timestamptz not null default now(),
  constraint recordings_path_owner check (split_part(path, '/', 1) = user_id::text)
);

create index if not exists recordings_user_created_idx on public.recordings (user_id, created_at desc);
create index if not exists recordings_answer_idx on public.recordings (answer_id) where answer_id is not null;
create index if not exists recordings_listening_idx on public.recordings (listening_id) where listening_id is not null;

alter table public.recordings enable row level security;

create policy "recordings_select_own" on public.recordings for select to authenticated using ((select auth.uid()) = user_id);
create policy "recordings_insert_own" on public.recordings for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "recordings_update_own" on public.recordings for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "recordings_delete_own" on public.recordings for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.recordings from anon;
grant select, insert, update, delete on public.recordings to authenticated;
