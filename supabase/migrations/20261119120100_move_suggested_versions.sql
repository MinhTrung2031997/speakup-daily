-- Move the versions kept in daily_questions.suggested ({versions:[...]} or one object) into the table.
insert into public.suggested_answers (id, user_id, question_id, data, created_at)
select
  case when v.elem->>'id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then (v.elem->>'id')::uuid else gen_random_uuid() end,
  q.user_id, q.id, v.elem - 'id',
  coalesce(to_timestamp(nullif(v.elem->>'createdAt', '')::double precision / 1000), q.created_at + v.n * interval '1 second')
from public.daily_questions q
cross join lateral jsonb_array_elements(
  case when jsonb_typeof(q.suggested->'versions') = 'array' then q.suggested->'versions'
       when q.suggested ? 'answer' then jsonb_build_array(q.suggested) else '[]'::jsonb end
) with ordinality as v(elem, n)
where q.suggested is not null
on conflict (id) do nothing;
update public.daily_questions set suggested = null where suggested is not null;

