import { addDays, todayStr } from './date';
/** Anything reviewed with spaced repetition (phrases, "Sounds to fix"). */
export interface SrsItem { stage: number; due: string }

/** Review days after the phrase is first saved. */
export const INTERVALS = [1, 3, 7, 14, 30];
export const MASTERED_STAGE = INTERVALS.length; // passed all 5 reviews

export function initialDue(added: string): string {
  return addDays(added, INTERVALS[0]);
}

/** Schedule the next review after a correct/incorrect answer. */
export function schedule(p: SrsItem, ok: boolean, today = todayStr()): SrsItem {
  if (!ok) return { stage: Math.max(0, p.stage - 1), due: addDays(today, 1) };
  const stage = Math.min(MASTERED_STAGE, p.stage + 1);
  if (stage >= MASTERED_STAGE) return { stage, due: '9999-12-31' };
  const gap = INTERVALS[stage] - INTERVALS[stage - 1];
  return { stage, due: addDays(today, gap) };
}

export function isDue(p: SrsItem, today = todayStr()): boolean {
  return p.stage < MASTERED_STAGE && p.due <= today;
}

export function stageLabel(stage: number): string {
  if (stage >= MASTERED_STAGE) return 'Mastered';
  if (stage === 0) return 'New';
  return `Review ${stage}/${MASTERED_STAGE}`;
}

/**
 * Three-level grading (Natural / Understandable / Off). Review dates are always computed here, never by the AI.
 * - natural: a full step forward (same as a correct review).
 * - understandable: half credit: keep the stage, come back after half the gap a correct review would use (min 1 day).
 * - off: same as a wrong review (stage down by 1, due tomorrow).
 */
export function scheduleLevel(p: SrsItem, level: 'natural' | 'understandable' | 'off', today = todayStr()): SrsItem {
  if (level === 'natural') return schedule(p, true, today);
  if (level === 'off') return schedule(p, false, today);
  const s = Math.min(p.stage, MASTERED_STAGE - 1);
  const gap = s + 1 < INTERVALS.length ? INTERVALS[s + 1] - INTERVALS[s] : INTERVALS[s] - (INTERVALS[s - 1] ?? 0);
  return { stage: s, due: addDays(today, Math.max(1, Math.floor(gap / 2))) };
}
