// Wrapper around EL's pickReminder (reminders.ts, kept verbatim): on a day with 0 reviews left, templates that
// mention reviews are skipped, so a message never says "your 0 reviews". Same file in src/lib and the remind function.
import { REMINDERS, pickReminder, type ReminderKind } from './reminders.ts';

const MENTIONS_REVIEWS = /\{reviews\}|\breviews?\b/i;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function pickReminderFor(kind: ReminderKind, seed: string, vars: Record<string, string | number>): { title: string; body: string } {
  const reviews = Number(vars.reviews || 0);
  const all = REMINDERS[kind];
  const ok = all.filter((t) => !MENTIONS_REVIEWS.test(`${t.title} ${t.body}`));
  if (reviews > 0 || kind === 'onlyReviews' || !ok.length || ok.length === all.length) return pickReminder(kind, seed, vars);
  const t = ok[hash(kind + seed) % ok.length];
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] !== undefined && vars[k] !== '' ? String(vars[k]) : ''));
  return { title: fill(t.title).replace(/\s+,/g, ',').replace(/Hey ,/, 'Hey,').trim(), body: fill(t.body).trim() };
}
