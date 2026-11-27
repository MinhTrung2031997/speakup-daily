// Unit checks for Today's plan rules. Run: npx esbuild scripts/test-plan.ts --bundle --platform=node --outfile=.tmp/test-plan.mjs --format=esm && node .tmp/test-plan.mjs
import { buildPlan, refreshPlan, planStreak, nextReview, weakestArea, missingAnswerReviews, REVIEW_CAP, LIGHT_REVIEWS } from '../src/lib/plan';
import { defaultState } from '../src/lib/store';
import { pickReminderFor } from '../src/lib/reminderPick';
import { fillersPerMinute, pickRound, speedLevel, summarizeRound } from '../src/lib/speed';
import { measurePauses, speechOnset } from '../src/lib/audio';
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
  s.quickfire = [{ id: uuid(81), date: FRI } as AppState['quickfire'][number]];
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
  ok('many fillers -> speed round (replaces voice-only stand-in)', weakestArea(s, FRI).extra === 'speed' && weakestArea(s, FRI).why.includes('quick-fire'), weakestArea(s, FRI).why);
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
// 8) Reply speed meter
{
  const round = (n: number, avg: number | null, level: 'easy' | 'open' = 'easy') => ({ id: uuid(200 + n), date: addDays(FRI, -n), level, startLimit: 3, avgStart: avg, fillersPerMin: 4, longestPause: 0.8, misses: 0, answers: [], bestIndex: 0, worstIndex: 1, fillerSource: 'gemini', createdAt: n }) as AppState['quickfire'][number];
  ok('speed: starts at 3 s / easy', speedLevel([]).level === 'easy' && speedLevel([]).limit === 3);
  ok('speed: 2 rounds under 2 s -> still easy (2/3)', speedLevel([round(3, 1.8), round(2, 1.9)]).level === 'easy' && speedLevel([round(3, 1.8), round(2, 1.9)]).streak === 2);
  ok('speed: a slow round resets the run', speedLevel([round(4, 1.8), round(3, 1.9), round(2, 2.4), round(1, 1.5)]).streak === 1);
  const up = speedLevel([round(4, 2.6), round(3, 1.9), round(2, 1.7), round(1, 1.95)]);
  ok('speed: 3 in a row under 2 s -> open level, 2 s limit', up.level === 'open' && up.limit === 2);
  const easy = pickRound('easy', [], 42);
  ok('speed: easy round = 8 easy questions, no repeats', easy.length === 8 && easy.every((q) => q.level === 'easy') && new Set(easy.map((q) => q.q)).size === 8);
  const hard = pickRound('open', [], 42);
  const opens = hard.filter((q) => q.level === 'open').length;
  ok('speed: harder round mixes in open "why" questions (about half)', hard.length === 8 && opens >= 3 && opens <= 5 && new Set(hard.map((q) => q.q)).size === 8, `${opens} open`);
  const recent = easy.map((q) => q.q);
  ok('speed: next round avoids the last questions', pickRound('easy', recent, 7).every((q) => !recent.includes(q.q)));
  ok('speed: fillers/min uses speech time (min 3 s)', fillersPerMinute(2, 10) === 12 && fillersPerMinute(1, 1) === 20 && fillersPerMinute(0, 5) === 0);
  const ans = (start: number | null, fpm = 0, pause = 0, missed = false) => ({ q: 'q', level: 'easy', start, missed: missed || start == null, seconds: 6, speechSeconds: 4, fillers: 0, fillersPerMin: fpm, fillerSource: 'gemini', longestPause: pause, transcript: '' }) as AppState['quickfire'][number]['answers'][number];
  const sum = summarizeRound([ans(1.2), ans(0.8, 30), ans(4.1, 0, 0, true), ans(null), ans(0.9)], 3);
  ok('speed: averages (silent answer counts as limit + 1 s)', sum.avgStart === Math.round(((1.2 + 0.8 + 4.1 + 4 + 0.9) / 5) * 10) / 10 && sum.misses === 2, JSON.stringify(sum));
  ok('speed: best = fast and clean, worst = late start (silent answers not picked)', sum.bestIndex === 4 && sum.worstIndex === 2, `${sum.bestIndex}/${sum.worstIndex}`);
  // waveform onset: 1.3 s of near-silence then a tone
  const rate = 16000;
  const pcm = new Float32Array(rate * 4);
  for (let i = 0; i < pcm.length; i++) pcm[i] = (Math.random() - 0.5) * 0.002 + (i > rate * 1.3 && i < rate * 2.2 || i > rate * 2.9 ? Math.sin(i / 5) * 0.3 : 0);
  const on = speechOnset(pcm, rate);
  ok('speed: onset found at ~1.3 s', on != null && Math.abs(on - 1.3) < 0.08, String(on));
  ok('speed: silent clip -> no onset', speechOnset(new Float32Array(rate * 2).map(() => (Math.random() - 0.5) * 0.002), rate) === null);
  ok('speed: longest pause ~0.7 s', Math.abs(measurePauses(pcm.subarray(Math.floor(1.3 * rate)), rate, 0.3).longestPause - 0.7) < 0.1);
  // plan
  const s = base();
  s.entries = [entry(1, addDays(FRI, -1), 90, { fluency: { words: 90, seconds: 60, wpm: 90, fillers: 9, fillerWords: {}, restarts: 0, restartExamples: [], pauses: 0, longestPause: 0, tip: '', createdAt: 0 } })];
  let p = buildPlan(s, FRI);
  const ex = p.items.find((i) => i.kind === 'extra');
  ok('plan: fluency-weak day -> extra is the speed round (/speed)', ex?.extra === 'speed' && ex.link === '/speed', `${ex?.extra} ${ex?.link}`);
  s.quickfire = [round(0, 2.1)];
  p = refreshPlan(s, p, FRI);
  ok('plan: speed step ticks when a round is saved today', !!p.items.find((i) => i.kind === 'extra')?.done);
  const s2 = base();
  s2.entries = [entry(1, addDays(FRI, -1), 90), entry(2, addDays(FRI, -2), 90)];
  s2.hunt = { days: [], uses: [1, 2, 3].map((n) => ({ id: uuid(n), date: addDays(FRI, -1), phrase: `p${n}`, ref: `r${n}`, source: 'answer', level: 'natural', evidence: '', note: '', better: '', question: '', createdAt: 0 })) as AppState['hunt']['uses'], swaps: [] };
  s2.quickfire = [round(1, 3.2)];
  ok('plan: slow last speed round -> speed extra', weakestArea(s2, FRI).extra === 'speed', weakestArea(s2, FRI).why);
}
console.log(fails ? `${fails} FAILED` : 'ALL PASS');
process.exit(fails ? 1 : 0);
