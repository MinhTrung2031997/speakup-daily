// Today's plan (ES/EL rules, Nov 27):
// - Every day: the daily question + the due phrase reviews (cap 8).
// - Light day after a missed day: the daily question + 3 reviews only.
// - One rotating extra, picked by the weakest area in the last 7 days: low fluency / many fillers -> voice-only scene
//   (no speed round yet); dictation misses -> Listen; short or simple answers -> role-play scene or Discord round;
//   few active words -> Say it better.
// - Old-answer redo (answer_reviews, 1/3/7/21 days) only Tue + Sat, or when one is 3+ days overdue; lowest score first.
// - Streak = the daily question + the due reviews done (DailyPlan.streakDay).
// The plan's items are fixed when it is built (once per local day); the done flags are re-derived from saved activity.
import { addDays, daysBetween, prettyDate, todayStr } from './date';
import { isDue } from './srs';
import type { ReminderKind } from './reminders';
import { pickReminderFor } from './reminderPick';
import type { AnswerReview, AppState, DailyPlan, Entry, PlanExtra, PlanItem } from './types';

export const REVIEW_CAP = 8;
export const LIGHT_REVIEWS = 3;
/** Answer review gaps (days) after step 0..3. Step 4 = done. */
export const ANSWER_GAPS = [1, 3, 7, 21];
export const REDO_DAYS = [2, 6]; // Tue, Sat

export const isDailyAnswer = (e: Entry) => !e.builder && !e.replay;

export function questionDoneOn(s: AppState, d: string): boolean {
  return s.entries.some((e) => e.date === d && isDailyAnswer(e));
}

/** Phrase reviews logged on a date. */
export function reviewsOn(s: AppState, d: string): number {
  return s.phrases.reduce((n, p) => n + p.reviews.filter((r) => r.date === d).length, 0);
}

export const duePhrases = (s: AppState, today = todayStr()) => s.phrases.filter((p) => isDue(p, today)).length;

function planFor(s: AppState, d: string): DailyPlan | undefined {
  return (s.plans || []).find((p) => p.date === d);
}

/** Did this day count for the streak? Days before the plan existed count if the daily question was answered. */
export function streakDayOn(s: AppState, d: string): boolean {
  const p = planFor(s, d);
  if (p) return p.streakDay;
  return questionDoneOn(s, d);
}

export function planStreak(s: AppState, today = todayStr()): { current: number; best: number; doneToday: boolean } {
  const doneToday = streakDayOn(s, today);
  let d = doneToday ? today : addDays(today, -1);
  let current = 0;
  while (streakDayOn(s, d) && current < 3650) { current++; d = addDays(d, -1); }
  const days = new Set<string>([...s.entries.filter(isDailyAnswer).map((e) => e.date), ...(s.plans || []).map((p) => p.date)]);
  let best = 0, run = 0, prev = '';
  for (const x of [...days].sort()) {
    if (!streakDayOn(s, x)) { run = 0; prev = ''; continue; }
    run = prev && addDays(prev, 1) === x ? run + 1 : 1;
    best = Math.max(best, run);
    prev = x;
  }
  return { current, best: Math.max(best, current), doneToday };
}

/** A rough 0-100 score of an answer, for "lowest-scored first". */
export function answerScore(e: Entry | undefined): number {
  if (!e) return 100;
  const xs: number[] = [];
  if (e.pronunciation) xs.push(e.pronunciation.score);
  if (e.retry) xs.push(e.retry.score);
  if (e.replay?.compare) xs.push(e.replay.compare.score.new * 10);
  if (e.fluency) xs.push(Math.max(0, 100 - e.fluency.fillers * 8));
  return xs.length ? Math.min(...xs) : 70;
}

/** Latest attempt (daily answer or redo) at the same question as this answer. */
export function latestAttempt(s: AppState, base: Entry): Entry {
  const same = s.entries.filter((e) => !e.builder && (e.id === base.id || (base.questionId && e.questionId === base.questionId) || e.replay?.firstAnswerId === base.id));
  return same.sort((a, b) => a.createdAt - b.createdAt).pop() || base;
}

export function dueAnswerReviews(s: AppState, today = todayStr()): { review: AnswerReview; entry: Entry; score: number }[] {
  const byId = new Map(s.entries.map((e) => [e.id, e]));
  return (s.answerReviews || [])
    .filter((r) => r.step < ANSWER_GAPS.length && r.dueAt <= today && byId.has(r.answerId))
    .map((r) => { const entry = byId.get(r.answerId)!; return { review: r, entry, score: answerScore(latestAttempt(s, entry)) }; })
    .sort((a, b) => a.score - b.score || a.review.dueAt.localeCompare(b.review.dueAt));
}

/** New daily answers that don't have a review row yet (due the day after they were answered). */
export function missingAnswerReviews(s: AppState): AnswerReview[] {
  const have = new Set((s.answerReviews || []).map((r) => r.answerId));
  const now = Date.now();
  return s.entries.filter((e) => isDailyAnswer(e) && !have.has(e.id) && /^[0-9a-f-]{36}$/i.test(e.id))
    .map((e) => ({ answerId: e.id, dueAt: addDays(e.date, ANSWER_GAPS[0]), step: 0, lastResult: 'new' as const, reviews: 0, createdAt: now, updatedAt: now }));
}

/** After a redo: better -> next gap; otherwise back to 1 day. */
export function nextReview(r: AnswerReview, better: boolean, same: boolean, today = todayStr()): AnswerReview {
  const step = better ? r.step + 1 : 0;
  const done = step >= ANSWER_GAPS.length;
  return {
    ...r, step: Math.min(step, ANSWER_GAPS.length), dueAt: done ? '9999-12-31' : addDays(today, ANSWER_GAPS[step]),
    lastResult: better ? 'better' : same ? 'same' : 'worse', lastReviewedOn: today, reviews: r.reviews + 1, updatedAt: Date.now(),
  };
}

// ---- weakest area (last 7 days) ----
export interface Weakness { extra: PlanExtra; why: string }
const EXTRA: Record<PlanExtra, { title: string; mins: number; link: string }> = {
  voice: { title: 'Voice-only role-play', mins: 5, link: '/chat?mode=scene' },
  listen: { title: 'Listen + dictation drill', mins: 5, link: '/listen' },
  scene: { title: 'Role-play scene', mins: 5, link: '/chat?mode=scene' },
  discord: { title: 'Discord group round', mins: 5, link: '/chat?mode=discord' },
  say: { title: 'Say it better', mins: 4, link: '/say' },
};

function hashStr(x: string): number {
  let h = 0;
  for (let i = 0; i < x.length; i++) h = (h * 31 + x.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function weakestArea(s: AppState, today = todayStr()): Weakness {
  const from = addDays(today, -7);
  const recent = s.entries.filter((e) => e.date >= from && e.date < today && !e.builder);
  const flu = recent.map((e) => e.fluency).filter((f): f is NonNullable<Entry['fluency']> => !!f && f.words > 0);
  const flagged: (Weakness & { sev: number })[] = [];
  if (flu.length) {
    const wpm = flu.reduce((a, f) => a + f.wpm, 0) / flu.length;
    const fillersPer100 = (flu.reduce((a, f) => a + f.fillers, 0) / Math.max(1, flu.reduce((a, f) => a + f.words, 0))) * 100;
    if (fillersPer100 >= 4 || wpm < 95) flagged.push({ extra: 'voice', why: fillersPer100 >= 4 ? `Lots of fillers this week (${Math.round(fillersPer100)} per 100 words). Voice-only mode trains you to start fast.` : `Your pace was slow this week (${Math.round(wpm)} words/min). Voice-only mode trains you to start fast.`, sev: Math.max(fillersPer100 / 4, 95 / Math.max(wpm, 1)) });
  }
  const dict = (s.listens || []).filter((l) => l.date >= from && l.dictationAccuracy != null);
  if (dict.length) {
    const acc = dict.reduce((a, l) => a + (l.dictationAccuracy || 0), 0) / dict.length;
    if (acc < 80) flagged.push({ extra: 'listen', why: `Dictation was ${Math.round(acc)}% this week. One more listening drill.`, sev: 80 / Math.max(acc, 1) });
  }
  const daily = recent.filter((e) => e.answer.trim());
  if (daily.length >= 1) {
    const words = daily.reduce((a, e) => a + e.answer.trim().split(/\s+/).length, 0) / daily.length;
    if (words < 60) {
      const extra: PlanExtra = hashStr(today) % 2 ? 'discord' : 'scene';
      flagged.push({ extra, why: `Your answers were short this week (about ${Math.round(words)} words). A longer conversation stretches them.`, sev: 60 / Math.max(words, 1) });
    }
    const natural = new Set((s.hunt?.uses || []).filter((u) => u.date >= from && u.level === 'natural').map((u) => u.phrase.toLowerCase()));
    if (natural.size < 3) flagged.push({ extra: 'say', why: `${natural.size ? `Only ${natural.size} saved phrase${natural.size === 1 ? '' : 's'}` : 'None of your saved phrases'} used naturally this week. Say it better gives you new ones to use.`, sev: 1.2 - natural.size * 0.2 });
  }
  if (flagged.length) return flagged.sort((a, b) => b.sev - a.sev)[0];
  const rota: PlanExtra[] = ['voice', 'listen', 'scene', 'say', 'discord'];
  return { extra: rota[hashStr(`rota${today}`) % rota.length], why: 'Rotating extra for today.' };
}

// ---- building + status ----
export function buildPlan(s: AppState, today = todayStr()): DailyPlan {
  const yesterday = addDays(today, -1);
  const hasHistory = s.entries.some((e) => isDailyAnswer(e) && e.date < yesterday);
  const light = hasHistory && !streakDayOn(s, yesterday);
  const q = s.questions.filter((x) => x.date === today).pop();
  const items: PlanItem[] = [
    { id: 'question', kind: 'question', title: "Answer today's question", detail: q?.question || 'Out loud, about 1 minute.', mins: 4, link: '/#question', done: false },
  ];
  const due = Math.min(duePhrases(s, today), light ? LIGHT_REVIEWS : REVIEW_CAP);
  if (due > 0) items.push({ id: 'reviews', kind: 'reviews', title: `Review ${due} phrase${due > 1 ? 's' : ''}`, detail: 'Words due from Learn. Use each one in a sentence.', mins: Math.max(2, due), link: '/phrases', target: due, done: false });
  let weak: string | undefined;
  if (!light) {
    const dueAns = dueAnswerReviews(s, today);
    const dow = new Date(`${today}T12:00:00`).getDay();
    const overdue = dueAns.some((x) => daysBetween(x.review.dueAt, today) >= 3);
    if (dueAns.length && (REDO_DAYS.includes(dow) || overdue)) {
      const pick = dueAns[0];
      items.push({ id: 'redo', kind: 'redo', title: 'Redo an old answer', detail: `"${pick.entry.question}" (${prettyDate(pick.entry.date)})`, mins: 4, link: `/replay?review=${pick.review.answerId}`, answerId: pick.review.answerId, done: false });
    }
    const w = weakestArea(s, today);
    weak = w.why;
    const x = EXTRA[w.extra];
    items.push({ id: 'extra', kind: 'extra', extra: w.extra, title: x.title, detail: w.why, mins: x.mins, link: x.link, done: false });
  }
  const now = Date.now();
  return refreshPlan(s, { date: today, items, light, ...(weak ? { weak } : {}), ...(q ? { question: q.question } : {}), streak: 0, questionDone: false, reviewsDone: false, streakDay: false, leftText: '', leftMins: 0, reviewsLeft: 0, createdAt: now, updatedAt: now }, today);
}

function extraDone(s: AppState, extra: PlanExtra | undefined, d: string): boolean {
  const talked = (kind: 'scene' | 'discord', voiceOnly?: boolean) => (s.partner?.sessions || []).some((x) => x.date === d && x.kind === kind && (voiceOnly === undefined || x.voiceOnly === voiceOnly)
    && (!!x.feedback || x.turns.filter((t) => t.role === 'user').length >= 3));
  switch (extra) {
    case 'voice': return talked('scene', true) || talked('discord', true);
    case 'scene': return talked('scene');
    case 'discord': return talked('discord');
    case 'listen': return (s.listens || []).some((l) => l.date === d);
    case 'say': return (s.saySessions || []).some((x) => x.date === d);
    default: return false;
  }
}

/** Re-derive done flags + summary. Returns the same object when nothing changed (so the sync diff stays quiet). */
export function refreshPlan(s: AppState, p: DailyPlan, today = p.date): DailyPlan {
  const questionDone = questionDoneOn(s, p.date);
  const target = p.items.find((i) => i.kind === 'reviews')?.target || 0;
  const reviewedToday = reviewsOn(s, p.date);
  const dueLeft = duePhrases(s, today);
  const reviewsLeft = Math.max(0, Math.min(target - reviewedToday, dueLeft));
  const reviewsDone = reviewsLeft === 0;
  const now = Date.now();
  const items = p.items.map((i) => {
    const done = i.kind === 'question' ? questionDone
      : i.kind === 'reviews' ? reviewsDone
      : i.kind === 'redo' ? (s.answerReviews || []).some((r) => r.answerId === i.answerId && r.lastReviewedOn === p.date)
      : extraDone(s, i.extra, p.date);
    const keep = i.done || done; // once ticked, stays ticked
    return keep === i.done ? i : { ...i, done: keep, doneAt: keep ? now : undefined };
  });
  const parts: string[] = [];
  let mins = 0;
  for (const i of items) {
    if (i.done) continue;
    if (i.kind === 'question') { parts.push('1 question'); mins += i.mins; }
    if (i.kind === 'reviews') { parts.push(`${reviewsLeft} review${reviewsLeft === 1 ? '' : 's'}`); mins += Math.max(1, reviewsLeft); }
    if (i.kind === 'redo') { parts.push('1 old answer'); mins += i.mins; }
    if (i.kind === 'extra') { parts.push('1 drill'); mins += i.mins; }
  }
  const streakDay = questionDone && items.every((i) => i.kind !== 'reviews' || i.done);
  const completed = items.every((i) => i.done);
  const q = p.question || s.questions.filter((x) => x.date === p.date).pop()?.question;
  const next: DailyPlan = {
    ...p, items, questionDone, reviewsDone: items.every((i) => i.kind !== 'reviews' || i.done), streakDay, reviewsLeft: items.some((i) => i.kind === 'reviews' && !i.done) ? reviewsLeft : 0,
    leftText: parts.join(' + '), leftMins: mins, ...(q ? { question: q } : {}),
    completedAt: completed ? (p.completedAt || now) : undefined,
  };
  // Keep `items` identity when no item changed.
  if (items.every((x, k) => x === p.items[k])) next.items = p.items;
  next.streak = planStreak({ ...s, plans: [...(s.plans || []).filter((x) => x.date !== p.date), next] }, p.date).current;
  const same = next.items === p.items && next.questionDone === p.questionDone && next.reviewsDone === p.reviewsDone && next.streakDay === p.streakDay
    && next.reviewsLeft === p.reviewsLeft && next.leftText === p.leftText && next.leftMins === p.leftMins && next.question === p.question
    && !!next.completedAt === !!p.completedAt && next.streak === p.streak;
  return same ? p : { ...next, updatedAt: now };
}

/** In-app line from EL's reminders.ts (same picker as the push). */
export function planMessage(s: AppState, p: DailyPlan): { title: string; body: string; kind: ReminderKind } {
  const kind: ReminderKind = p.completedAt ? 'done' : p.light ? 'comeback' : p.questionDone ? (p.reviewsLeft > 0 ? 'onlyReviews' : 'first') : 'first';
  const q = (p.question || "today's question").replace(/\s+/g, ' ');
  const m = pickReminderFor(kind, p.date, {
    name: s.profile.name.trim().split(/\s+/)[0] || '', left: p.leftText || 'nothing', mins: Math.max(1, p.leftMins), q: q.length > 70 ? `${q.slice(0, 67)}…` : q,
    reviews: p.reviewsLeft, streak: p.streak,
  });
  return { ...m, kind };
}
