-- SpeakUp Daily: core schema (mirrors src/lib/types.ts AppState)
-- Every table is owned by one user (user_id -> auth.users, cascade delete) and protected by RLS.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (Profile)
-- ---------------------------------------------------------------------------
create table public.profiles (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  name       text not null default '',
  job        text not null default '',
  city       text not null default '',
  hobbies    text not null default '',
  goals      text not null default '',
  level      text not null default 'B1–B2 (intermediate)',
  facts      text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- user_settings (Settings). The Gemini API key is NOT stored here; it lives as an
-- Edge Function secret on the server.
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id    uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  model      text not null default 'gemini-flash-lite-latest',
  dark       boolean not null default false,
  voice_uri  text not null default '',
  rate       numeric(3,2) not null default 1.00 check (rate between 0.5 and 2.0),
  onboarded  boolean not null default false,
  fast_mode  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- topics (Topic)
-- ---------------------------------------------------------------------------
create table public.topics (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slug       text not null,               -- 'work', 'tech', ... for presets; generated for custom
  name       text not null check (length(name) between 1 and 80),
  emoji      text not null default '💬',
  active     boolean not null default true,
  is_custom  boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug),
  unique (id, user_id)
);
create index topics_user_active_idx on public.topics (user_id, active);

-- ---------------------------------------------------------------------------
-- daily_questions (DailyQuestion). Several per day are allowed ("New question").
-- ---------------------------------------------------------------------------
create table public.daily_questions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id     text,                      -- id from the old browser-storage data (import)
  topic_id      uuid,
  topic_name    text not null default '',
  question      text not null,
  starters      text[] not null default '{}',
  question_date date not null default current_date,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, client_id),
  foreign key (topic_id, user_id) references public.topics (id, user_id) on delete set null (topic_id)
);
create index daily_questions_user_date_idx on public.daily_questions (user_id, question_date desc);
create index daily_questions_topic_idx on public.daily_questions (topic_id, user_id);

-- ---------------------------------------------------------------------------
-- answers (Entry). upgrade = Upgrade JSON, retry = RetryResult JSON (without fluency;
-- fluency for both lives in fluency_stats).
-- ---------------------------------------------------------------------------
create table public.answers (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id   text,
  question_id uuid,
  question    text not null default '',
  topic_name  text not null default '',
  answer      text not null default '',
  upgrade     jsonb,
  retry       jsonb,
  retry_score smallint check (retry_score between 0 and 100),
  input_mode  text not null default 'text' check (input_mode in ('text', 'voice')),
  answer_date date not null default current_date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, client_id),
  foreign key (question_id, user_id) references public.daily_questions (id, user_id) on delete set null (question_id)
);
create index answers_user_date_idx on public.answers (user_id, answer_date desc);
create index answers_user_topic_idx on public.answers (user_id, topic_name);
create index answers_question_idx on public.answers (question_id, user_id);

-- ---------------------------------------------------------------------------
-- chat_sessions / chat_messages (ChatSession / ChatMessage)
-- ---------------------------------------------------------------------------
create table public.chat_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id    text,
  question_id  uuid,
  topic_name   text not null default '',
  question     text not null default '',
  feedback     jsonb,                      -- ChatFeedback
  session_date date not null default current_date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, client_id),
  foreign key (question_id, user_id) references public.daily_questions (id, user_id) on delete set null (question_id)
);
create index chat_sessions_user_date_idx on public.chat_sessions (user_id, session_date desc);
create index chat_sessions_question_idx on public.chat_sessions (question_id, user_id);

create table public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null,
  position   integer not null,
  role       text not null check (role in ('user', 'model')),
  text       text not null,
  nudge      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (session_id, position),
  foreign key (session_id, user_id) references public.chat_sessions (id, user_id) on delete cascade
);
create index chat_messages_user_idx on public.chat_messages (user_id);
create index chat_messages_session_user_idx on public.chat_messages (session_id, user_id);

-- ---------------------------------------------------------------------------
-- phrases (Phrase) with spaced-repetition fields; stage 0..5 (5 = mastered),
-- review days 1, 3, 7, 14, 30 (src/lib/srs.ts). phrase_reviews = ReviewLog.
-- ---------------------------------------------------------------------------
create table public.phrases (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id        text,
  source_answer_id uuid,
  phrase           text not null check (length(phrase) between 1 and 200),
  meaning          text not null default '',
  example          text not null default '',
  source           text not null default '',  -- question it came from
  added_date       date not null default current_date,
  stage            smallint not null default 0 check (stage between 0 and 5),
  due              date not null default (current_date + 1),
  last_reviewed_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, client_id),
  foreign key (source_answer_id, user_id) references public.answers (id, user_id) on delete set null (source_answer_id)
);
create unique index phrases_user_phrase_key on public.phrases (user_id, lower(phrase));
create index phrases_user_due_idx on public.phrases (user_id, due) where stage < 5;
create index phrases_user_stage_idx on public.phrases (user_id, stage);
create index phrases_source_answer_idx on public.phrases (source_answer_id, user_id);

create table public.phrase_reviews (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  phrase_id   uuid not null,
  review_date date not null default current_date,
  sentence    text not null,
  ok          boolean not null,
  feedback    text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (phrase_id, user_id) references public.phrases (id, user_id) on delete cascade
);
create index phrase_reviews_user_date_idx on public.phrase_reviews (user_id, review_date desc);
create index phrase_reviews_phrase_idx on public.phrase_reviews (phrase_id, user_id);

-- ---------------------------------------------------------------------------
-- fluency_stats (FluencyStats): one row per spoken attempt.
-- kind: 'answer' (original answer), 'retry' (say it again), 'shadowing', 'chat'.
-- ---------------------------------------------------------------------------
create table public.fluency_stats (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  answer_id           uuid,
  chat_session_id     uuid,
  kind                text not null default 'answer' check (kind in ('answer', 'retry', 'shadowing', 'chat')),
  words               integer not null default 0 check (words >= 0),
  duration_seconds    numeric(7,2) not null default 0 check (duration_seconds >= 0),
  wpm                 numeric(6,1) not null default 0 check (wpm >= 0),
  filler_count        integer not null default 0 check (filler_count >= 0),
  filler_words        jsonb not null default '{}'::jsonb,  -- { "uhm": 2, "like": 1 }
  restarts            integer not null default 0 check (restarts >= 0),
  restart_examples    text[] not null default '{}',
  long_pauses         integer not null default 0 check (long_pauses >= 0),  -- gaps > 2s
  longest_pause_seconds numeric(6,2) not null default 0 check (longest_pause_seconds >= 0),
  tip                 text not null default '',
  recorded_date       date not null default current_date,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  foreign key (answer_id, user_id) references public.answers (id, user_id) on delete cascade,
  foreign key (chat_session_id, user_id) references public.chat_sessions (id, user_id) on delete cascade
);
create index fluency_stats_user_date_idx on public.fluency_stats (user_id, recorded_date desc);
create index fluency_stats_answer_idx on public.fluency_stats (answer_id, user_id);
create index fluency_stats_chat_idx on public.fluency_stats (chat_session_id, user_id);

-- ---------------------------------------------------------------------------
-- shadowing_attempts: one take of one sentence (listen -> repeat -> compare).
-- recording_path points into the private 'recordings' bucket: '<user_id>/...'.
-- ---------------------------------------------------------------------------
create table public.shadowing_attempts (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  answer_id        uuid,
  chat_message_id  uuid,
  source_text      text not null default '',   -- full model text being shadowed
  sentence_index   integer not null default 0 check (sentence_index >= 0),
  sentence         text not null,
  transcript       text not null default '',
  score            smallint check (score between 0 and 100),
  duration_seconds numeric(7,2) not null default 0 check (duration_seconds >= 0),
  recording_path   text,
  attempt_date     date not null default current_date,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (answer_id, user_id) references public.answers (id, user_id) on delete set null (answer_id),
  foreign key (chat_message_id, user_id) references public.chat_messages (id, user_id) on delete set null (chat_message_id)
);
create index shadowing_attempts_user_date_idx on public.shadowing_attempts (user_id, attempt_date desc);
create index shadowing_attempts_answer_idx on public.shadowing_attempts (answer_id, user_id);
create index shadowing_attempts_chat_message_idx on public.shadowing_attempts (chat_message_id, user_id);

-- ---------------------------------------------------------------------------
-- daily_activity (speakingLog + activityLog): one row per user per day, for streaks.
-- ---------------------------------------------------------------------------
create table public.daily_activity (
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  activity_date   date not null default current_date,
  seconds_spoken  numeric(9,2) not null default 0 check (seconds_spoken >= 0),
  practice_count  integer not null default 0 check (practice_count >= 0),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  primary key (user_id, activity_date)
);

-- ---------------------------------------------------------------------------
-- updated_at triggers, grants, RLS + policies for every table
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'user_settings', 'topics', 'daily_questions', 'answers',
    'chat_sessions', 'chat_messages', 'phrases', 'phrase_reviews',
    'fluency_stats', 'shadowing_attempts', 'daily_activity'
  ] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy "Users can read own %1$s" on public.%1$I for select to authenticated using ((select auth.uid()) = user_id)', t);
    execute format('create policy "Users can insert own %1$s" on public.%1$I for insert to authenticated with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "Users can update own %1$s" on public.%1$I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t);
    execute format('create policy "Users can delete own %1$s" on public.%1$I for delete to authenticated using ((select auth.uid()) = user_id)', t);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- On signup: create profile, settings and the 7 preset topics.
-- security definer lives in the unexposed "private" schema.
-- ---------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''))
  on conflict (user_id) do nothing;

  insert into public.user_settings (user_id)
  values (new.id)
  on conflict (user_id) do nothing;

  insert into public.topics (user_id, slug, name, emoji, active, is_custom, sort_order)
  values
    (new.id, 'work',     'Work & Career',      '💼', true, false, 1),
    (new.id, 'tech',     'Technology',         '💻', true, false, 2),
    (new.id, 'daily',    'Daily Life',         '☕', true, false, 3),
    (new.id, 'travel',   'Travel',             '✈️', true, false, 4),
    (new.id, 'opinions', 'Opinions & Debates', '🗣️', true, false, 5),
    (new.id, 'hobbies',  'Hobbies',            '🎮', true, false, 6),
    (new.id, 'food',     'Food & Culture',     '🍜', true, false, 7)
  on conflict (user_id, slug) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
