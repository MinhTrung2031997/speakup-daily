-- Answer builder: keep the builder data (question type, answer parts, picked ideas, level, length,
-- labelled model-answer parts) with the answer. Additive and nullable; existing RLS on answers
-- ((select auth.uid()) = user_id) already covers the new column.
alter table public.answers add column if not exists builder jsonb;

comment on column public.answers.builder is
  'Answer builder data (BuilderInfo JSON: qtype, slots, picks, level, seconds, parts). Null for normal daily answers.';
