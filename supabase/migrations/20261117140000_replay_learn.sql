-- Replay (re-answer old questions) + Learn highlighted words. Additive only.
alter table public.phrases
  add column if not exists origin text not null default 'answer' check (origin in ('answer', 'suggested', 'builder', 'listen', 'manual')),
  add column if not exists learned_by_voice boolean not null default false;

alter table public.phrase_reviews
  add column if not exists level text check (level in ('natural', 'understandable', 'off')),
  add column if not exists drill text check (drill in ('use', 'fill', 'situation', 'speed', 'replay'));

-- Replay result on the NEW answer: { firstAnswerId, targets:[...], compare:{...} }
alter table public.answers add column if not exists replay jsonb;
