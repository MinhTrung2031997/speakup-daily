-- Cached suggested answer for a daily question ("💡 Show a suggested answer"). Additive; existing RLS applies.
alter table public.daily_questions add column if not exists suggested jsonb;
