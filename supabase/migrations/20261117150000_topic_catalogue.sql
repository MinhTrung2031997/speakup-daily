-- Topic catalogue (17 topics in 4 groups): favourite topics + the seed question a daily question came from. Additive only.
alter table public.topics add column if not exists favorite boolean not null default false;
alter table public.daily_questions add column if not exists seed text;
