// Reply speed meter (quick-fire): round rules and maths. Questions come from EL's quickfire.ts (kept verbatim).
import { QUICK_FIRE, pickQuickFire, type QuickFire } from './quickfire';
import type { QuickFireAnswer, QuickFireRound } from './types';

export const ROUND_SIZE = 8;
export const EASY_LIMIT = 3;
export const HARD_LIMIT = 2;
/** Max answer length and the trailing silence that ends an answer early. */
export const MAX_ANSWER_S = 20;
export const TRAILING_SILENCE_S = 1.5;
/** If nothing is said for this long the answer ends (still a miss, still kept). */
export const NO_SPEECH_STOP_S = 8;
/** Rounds in a row with an average start under HARD_LIMIT that unlock the harder level. */
export const UNLOCK_ROUNDS = 3;

/** Harder level (2 s limit + open questions) once 3 rounds in a row averaged under 2 s. Stays unlocked. */
export function speedLevel(rounds: QuickFireRound[]): { level: 'easy' | 'open'; limit: number; streak: number } {
  let run = 0;
  for (const r of rounds) {
    if (r.avgStart != null && r.avgStart < HARD_LIMIT) {
      run++;
      if (run >= UNLOCK_ROUNDS) return { level: 'open', limit: HARD_LIMIT, streak: run };
    } else run = 0;
  }
  return { level: 'easy', limit: EASY_LIMIT, streak: run };
}

/** 8 questions: EL's picker (no repeats from recent rounds, mixed topics). Harder rounds mix in about half open questions. */
export function pickRound(level: 'easy' | 'open', recent: string[], seed: number): QuickFire[] {
  if (level === 'easy') return pickQuickFire('easy', recent, seed).slice(0, ROUND_SIZE);
  const all = pickQuickFire('open', recent, seed);
  const open = all.filter((x) => x.level === 'open');
  const easy = all.filter((x) => x.level === 'easy');
  const extraOpen = QUICK_FIRE.filter((x) => x.level === 'open' && !open.includes(x) && !recent.includes(x.q));
  const opens = [...open, ...extraOpen].slice(0, ROUND_SIZE / 2);
  const easies = [...easy, ...QUICK_FIRE.filter((x) => x.level === 'easy' && !easy.includes(x))].slice(0, ROUND_SIZE - opens.length);
  // Alternate easy / open so the round warms up first.
  const out: QuickFire[] = [];
  for (let i = 0; out.length < ROUND_SIZE && (i < easies.length || i < opens.length); i++) {
    if (easies[i]) out.push(easies[i]);
    if (opens[i] && out.length < ROUND_SIZE) out.push(opens[i]);
  }
  return out;
}

/** Questions used in the last few rounds (EL's picker avoids them). */
export function recentQuestions(rounds: QuickFireRound[], n = 3): string[] {
  return rounds.slice(-n).flatMap((r) => r.answers.map((a) => a.q));
}

const r1 = (v: number) => Math.round(v * 10) / 10;

/** Fillers per minute of speaking (speech time, min 3 s so a one-word answer can't explode the rate). */
export function fillersPerMinute(fillers: number, speechSeconds: number): number {
  if (!fillers) return 0;
  return r1((fillers / Math.max(3, speechSeconds)) * 60);
}

/** Lower is better: start time dominates; fillers and long pauses add a little. Silent answers are worst. */
export function answerCost(a: QuickFireAnswer, limit: number): number {
  if (a.start == null) return 100;
  return a.start + (a.missed ? limit : 0) + a.fillersPerMin * 0.05 + a.longestPause * 0.3;
}

export interface RoundSummary {
  avgStart: number | null;
  fillersPerMin: number | null;
  longestPause: number | null;
  misses: number;
  bestIndex: number | null;
  worstIndex: number | null;
  fillerSource: 'gemini' | 'chrome' | 'mixed';
}

/** Averages over the answers where something was said (a silent answer has no start time to average). */
export function summarizeRound(answers: QuickFireAnswer[], limit: number): RoundSummary {
  const spoke = answers.map((a, i) => ({ a, i })).filter((x) => x.a.start != null);
  const avg = (f: (a: QuickFireAnswer) => number) => (spoke.length ? r1(spoke.reduce((s, x) => s + f(x.a), 0) / spoke.length) : null);
  const ranked = [...spoke].sort((x, y) => answerCost(x.a, limit) - answerCost(y.a, limit));
  const srcs = new Set(spoke.map((x) => x.a.fillerSource));
  return {
    // Average start counts a silent answer as the full limit + 1 s so skipping never improves the average.
    avgStart: answers.length ? r1(answers.reduce((s, a) => s + (a.start == null ? limit + 1 : a.start), 0) / answers.length) : null,
    fillersPerMin: avg((a) => a.fillersPerMin),
    longestPause: avg((a) => a.longestPause),
    misses: answers.filter((a) => a.missed).length,
    bestIndex: ranked.length ? ranked[0].i : null,
    worstIndex: ranked.length > 1 ? ranked[ranked.length - 1].i : null,
    fillerSource: srcs.size > 1 ? 'mixed' : srcs.has('gemini') ? 'gemini' : 'chrome',
  };
}
