import { addDays, todayStr } from './date';
import type { AppState } from './types';
import { MASTERED_STAGE } from './srs';

export function activeDates(s: AppState): Set<string> {
  const set = new Set<string>();
  s.entries.forEach((e) => set.add(e.date));
  s.chats.forEach((c) => c.messages.some((m) => m.role === 'user') && set.add(c.date));
  Object.entries(s.activityLog).forEach(([d, n]) => n > 0 && set.add(d));
  Object.entries(s.speakingLog).forEach(([d, n]) => n > 0 && set.add(d));
  return set;
}

export function streak(s: AppState): { current: number; best: number; practicedToday: boolean } {
  const set = activeDates(s);
  const today = todayStr();
  const practicedToday = set.has(today);
  let d = practicedToday ? today : addDays(today, -1);
  let current = 0;
  while (set.has(d)) {
    current++;
    d = addDays(d, -1);
  }
  const sorted = Array.from(set).sort();
  let best = 0;
  let run = 0;
  let prev = '';
  for (const x of sorted) {
    run = prev && addDays(prev, 1) === x ? run + 1 : 1;
    best = Math.max(best, run);
    prev = x;
  }
  return { current, best: Math.max(best, current), practicedToday };
}

export function phraseStats(s: AppState) {
  const learned = s.phrases.filter((p) => p.stage >= 1).length;
  const mastered = s.phrases.filter((p) => p.stage >= MASTERED_STAGE).length;
  return { total: s.phrases.length, learned, mastered };
}
