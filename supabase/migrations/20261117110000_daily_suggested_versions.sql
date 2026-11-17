-- Suggested answers keep several versions ("➕ Another angle", max 5 in the app).
-- daily_questions.suggested is now {...latest version fields, "versions": [v1, v2, ...]}.
-- The latest version stays at the top level, so older app builds still read it.
-- Data-only and additive: wrap existing single suggestions into a one-item versions list. RLS unchanged.
update public.daily_questions
set suggested = suggested || jsonb_build_object('versions', jsonb_build_array(suggested || jsonb_build_object('id', id::text || '-v1')))
where suggested is not null
  and jsonb_typeof(suggested) = 'object'
  and not (suggested ? 'versions');

comment on column public.daily_questions.suggested is
  'Suggested answers: {...latest, versions: [{id, stance?, qtype, slots, ideas, level, seconds, answer, parts, phrases, createdAt}]}';
