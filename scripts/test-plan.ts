// Unit checks for Today's plan rules. Run: npx esbuild scripts/test-plan.ts --bundle --platform=node --outfile=.tmp/test-plan.mjs --format=esm && node .tmp/test-plan.mjs
import { buildPlan, refreshPlan, planStreak, nextReview, weakestArea, missingAnswerReviews, REVIEW_CAP, LIGHT_REVIEWS } from '../src/lib/plan';
import { defaultState } from '../src/lib/store';
import { pickReminderFor } from '../src/lib/reminderPick';
const leftFor = (qDone: boolean, reviews: number) => [qDone ? '' : '1 question', reviews ? `${reviews} reviews` : ''].filter(Boolean).join(' + ');
import { addDays } from '../src/lib/date';
import type { AppState, Entry, Phrase } from '../src/lib/types';

let fails = 0;
const ok = (name: string, cond: boolean, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); if (!cond) fails++; };
const FRI = '2026-11-27', SAT = '2026-11-28';
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const entry = (n: number, date: string, words = 80, extra: Partial<Entry> = {}): Entry => ({ id: uuid(n), date, questionId: `q${n}`, question: `Question ${n}?`, topicName: 'Food', answer: Array(words).fill('word').join(' '), createdAt: Date.parse(date), ...extra });
const phrase = (n: number, due: string): Phrase => ({ id: uuid(900 + n), phrase: `phrase ${n}`, meaning: '', example: '', source: '', createdAt: 0, addedDate: '2026-11-01', stage: 1, due, reviews: [], origin: 'answer' } as unknown as Phrase);
const base = (): AppState => ({ ...defaultState(), settings: { ...defaultState().settings, onboarded: true } });

// 1) normal day: question + reviews capped at 8 + extra; no redo on Friday unless overdue
{
  const s = base();
  s.entries = [entry(1, addDays(FRI, -1)), entry(2, addDays(FRI, -2))];
  s.phrases = Array.from({ length: 12 }, (_, i) => phrase(i, addDays(FRI, -1)));
  s.answerReviews = missingAnswerReviews(s);
  const p = buildPlan(s, FRI);
  const kinds = p.items.map((i) => i.kind).join(',');
  ok('normal day: question + reviews + extra', kinds === 'question,reviews,extra', kinds);
  ok('reviews capped at 8', p.items[1].target === REVIEW_CAP, String(p.items[1].target));
  ok('not a light day', !p.light);
  ok('left text says what is left', p.leftText === '1 question + 8 reviews + 1 drill', `${p.leftText}, ${p.leftMins} min`);
  const total = p.items.reduce((a, i) => a + i.mins, 0);
  ok('about 10-15 minutes when full', total >= 10 && total <= 17, `${total} min`);
}
// 2) light day after a missed day
{
  const s = base();
  s.entries = [entry(1, addDays(FRI, -3)), entry(2, addDays(FRI, -4))];
  s.phrases = Array.from({ length: 12 }, (_, i) => phrase(i, addDays(FRI, -1)));
  const p = buildPlan(s, FRI);
  ok('missed yesterday -> light day: question + 3 reviews only', p.light && p.items.length === 2 && p.items[1].target === LIGHT_REVIEWS, p.items.map((i) => `${i.kind}:${i.target ?? ''}`).join(','));
}
// 3) redo: Saturday yes, Friday no unless 3+ days overdue; lowest score first
{
  const s = base();
  s.entries = [
    entry(1, addDays(SAT, -1)),
    entry(2, addDays(SAT, -2), 80, { pronunciation: { score: 90 } as Entry['pronunciation'] }),
    entry(3, addDays(SAT, -2), 80, { pronunciation: { score: 40 } as Entry['pronunciation'] }),
  ];
  s.answerReviews = missingAnswerReviews(s);
  const sat = buildPlan(s, SAT);
  const redo = sat.items.find((i) => i.kind === 'redo');
  ok('Saturday plan has a redo, lowest score first', !!redo && redo.answerId === uuid(3), redo?.answerId);
  const fri = buildPlan({ ...s, entries: s.entries.map((e) => ({ ...e, date: addDays(e.date, -1) })) }, FRI);
  ok('Friday plan has no redo when nothing is overdue', !fri.items.some((i) => i.kind === 'redo'));
  const s2 = { ...s, answerReviews: s.answerReviews.map((r) => ({ ...r, dueAt: addDays(FRI, -4) })) };
  s2.entries = s.entries.map((e) => ({ ...e, date: addDays(FRI, -1) }));
  ok('Friday plan has a redo when one is 3+ days overdue', buildPlan(s2, FRI).items.some((i) => i.kind === 'redo'));
}
// 4) ticking + streak + completion
{
  const s = base();
  s.entries = [entry(1, addDays(FRI, -1))];
  s.phrases = [phrase(1, addDays(FRI, -1))];
  let p = buildPlan(s, FRI);
  s.plans = [p];
  ok('streak counts yesterday (question answered, no plan rows yet)', p.streak === 1, String(p.streak));
  s.entries = [...s.entries, entry(5, FRI)];
  p = refreshPlan(s, p, FRI);
  ok('question ticks after an answer is saved', p.items[0].done && !p.streakDay);
  s.phrases = [{ ...s.phrases[0], due: addDays(FRI, 3), stage: 2, reviews: [{ date: FRI, sentence: 'x', ok: true, feedback: '' }] }];
  p = refreshPlan(s, p, FRI);
  ok('reviews tick -> streak day, streak 2', p.items[1].done && p.streakDay && p.streak === 2, `streak ${p.streak}`);
  ok('plan not complete until the extra is done', !p.completedAt);
  s.saySessions = [{ id: uuid(77), date: FRI } as AppState['saySessions'][number]];
  s.listens = [{ id: uuid(78), date: FRI } as AppState['listens'][number]];
  s.partner = { sessions: [{ id: uuid(79), date: FRI, kind: 'scene', ref: 'x', title: 'x', voiceOnly: true, turns: [], feedback: {} as never, createdAt: 0, updatedAt: 0 }, { id: uuid(80), date: FRI, kind: 'discord', ref: 'x', title: 'x', voiceOnly: true, turns: [], feedback: {} as never, createdAt: 0, updatedAt: 0 }], stories: [] };
  p = refreshPlan(s, p, FRI);
  ok('extra ticks -> plan complete', !!p.completedAt && p.leftText === '', p.leftText);
  const same = refreshPlan(s, p, FRI);
  ok('refresh is stable (same object when nothing changed)', same === p);
  s.plans = [p];
  ok('planStreak = 2', planStreak(s, FRI).current === 2);
}
// 5) answer review schedule 1/3/7/21
{
  let r = { answerId: uuid(1), dueAt: FRI, step: 0, lastResult: 'new' as const, reviews: 0, createdAt: 0, updatedAt: 0 };
  const a = nextReview(r, true, false, FRI);
  ok('better -> next gap 3 days', a.step === 1 && a.dueAt === addDays(FRI, 3));
  const b = nextReview({ ...a, step: 2 }, true, false, FRI);
  ok('better at step 2 -> 21 days', b.dueAt === addDays(FRI, 21));
  const c = nextReview({ ...a, step: 3 }, true, false, FRI);
  ok('better at the last step -> done', c.step === 4 && c.dueAt === '9999-12-31');
  const d = nextReview({ ...a, step: 2 }, false, true, FRI);
  ok('not better -> back to 1 day', d.step === 0 && d.dueAt === addDays(FRI, 1) && d.lastResult === 'same');
  r = r; // keep
}
// 6) weakest area
{
  const s = base();
  s.entries = [entry(1, addDays(FRI, -1), 30), entry(2, addDays(FRI, -2), 30)];
  s.hunt = { days: [], uses: [1, 2, 3].map((n) => ({ id: uuid(n), date: addDays(FRI, -1), phrase: `p${n}`, ref: `r${n}`, source: 'answer', level: 'natural', evidence: '', note: '', better: '', question: '', createdAt: 0 })) as AppState['hunt']['uses'], swaps: [] };
  const w = weakestArea(s, FRI);
  ok('short answers -> role-play scene or Discord round', w.extra === 'scene' || w.extra === 'discord', `${w.extra}: ${w.why}`);
  s.entries = [entry(1, addDays(FRI, -1), 90, { fluency: { words: 90, seconds: 60, wpm: 90, fillers: 9, fillerWords: {}, restarts: 0, restartExamples: [], pauses: 0, longestPause: 0, tip: '', createdAt: 0 } })];
  ok('many fillers -> voice-only scene', weakestArea(s, FRI).extra === 'voice', weakestArea(s, FRI).why);
  s.entries = [entry(1, addDays(FRI, -1), 90), entry(2, addDays(FRI, -2), 90)];
  s.listens = [{ id: 'l', date: addDays(FRI, -1), dictationAccuracy: 55 } as AppState['listens'][number]];
  ok('dictation misses -> Listen drill', weakestArea(s, FRI).extra === 'listen');
  s.listens = [];
  s.hunt = { days: [], uses: [], swaps: [] };
  ok('few active words -> Say it better', weakestArea(s, FRI).extra === 'say');
}
// 7) reminder text on a day with 0 due reviews: {left} has no reviews, no template mentioning reviews is picked
{
  const kinds = ['first', 'evening', 'streakRisk', 'comeback', 'done'] as const;
  let bad = '';
  let checked = 0;
  for (let d = 0; d < 120; d++) {
    const date = addDays('2026-11-01', d);
    for (const k of kinds) {
      const m = pickReminderFor(k, date, { name: 'Trung', left: leftFor(false, 0), mins: 4, q: 'Coffee or tea?', reviews: 0, streak: 5 });
      checked++;
      const txt = `${m.title} ${m.body}`;
      if (/review|\{|\}|\b0\b/i.test(txt)) bad = bad || `${k} ${date}: ${txt}`;
    }
  }
  ok('0 due reviews: no reminder mentions reviews (all kinds, 120 days)', !bad, bad || `${checked} messages`);
  const withReviews = new Set<string>();
  for (let d = 0; d < 60; d++) withReviews.add(pickReminderFor('streakRisk', addDays('2026-11-01', d), { left: '1 question + 3 reviews', mins: 7, reviews: 3, streak: 5, q: 'x', name: 'T' }).body);
  ok('with reviews due, review templates are still used', [...withReviews].some((b) => /review/.test(b)), [...withReviews].join(' | '));
  const s = base();
  s.entries = [entry(1, addDays(FRI, -1))];
  const p = buildPlan(s, FRI);
  ok('plan with 0 due reviews: left text = "1 question + 1 drill" (no reviews)', !/review/.test(p.leftText) && p.leftText.startsWith('1 question'), p.leftText);
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
