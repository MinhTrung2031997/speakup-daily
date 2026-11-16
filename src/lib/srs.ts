import { addDays, todayStr } from './date';
import type { Phrase } from './types';

/** Review days after the phrase is first saved. */
export const INTERVALS = [1, 3, 7, 14, 30];
export const MASTERED_STAGE = INTERVALS.length; // passed all 5 reviews

export function initialDue(added: string): string {
  return addDays(added, INTERVALS[0]);
}

/** Schedule the next review after a correct/incorrect answer. */
export function schedule(p: Phrase, ok: boolean, today = todayStr()): Pick<Phrase, 'stage' | 'due'> {
  if (!ok) return { stage: Math.max(0, p.stage - 1), due: addDays(today, 1) };
  const stage = Math.min(MASTERED_STAGE, p.stage + 1);
  if (stage >= MASTERED_STAGE) return { stage, due: '9999-12-31' };
  const gap = INTERVALS[stage] - INTERVALS[stage - 1];
  return { stage, due: addDays(today, gap) };
}

export function isDue(p: Phrase, today = todayStr()): boolean {
  return p.stage < MASTERED_STAGE && p.due <= today;
}

export function stageLabel(stage: number): string {
  if (stage >= MASTERED_STAGE) return 'Mastered';
  if (stage === 0) return 'New';
  return `Review ${stage}/${MASTERED_STAGE}`;
}
