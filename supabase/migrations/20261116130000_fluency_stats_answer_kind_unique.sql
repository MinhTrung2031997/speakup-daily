-- One fluency record per answer per kind ('answer' / 'retry') so the app can upsert it.
-- Rows without an answer (shadowing, chat) have answer_id null and never conflict.
alter table public.fluency_stats
  add constraint fluency_stats_answer_kind_key unique (answer_id, kind);
