import { addDays, todayStr } from './date';
import type { AppState, FluencyStats } from './types';
import { MASTERED_STAGE } from './srs';

export function activeDates(s: AppState): Set<string> {
  const set = new Set<string>();
  s.entries.forEach((e) => set.add(e.date));
  s.chats.forEach((c) => c.messages.some((m) => m.role === 'user') && set.add(c.date));
  (s.listens || []).forEach((l) => set.add(l.date));
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

/** Every stored fluency record (original answers and "say it again" tries), tagged with its date. */
export function fluencyRecords(s: AppState): (FluencyStats & { date: string })[] {
  return s.entries.flatMap((e) => [e.fluency, e.retry?.fluency].filter((f): f is FluencyStats => !!f).map((f) => ({ ...f, date: e.date })));
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Per-day fluency averages for the given dates (0 = no spoken answers that day). */
export function fluencyByDay(s: AppState, days: string[]) {
  const recs = fluencyRecords(s);
  return days.map((d) => {
    const list = recs.filter((r) => r.date === d);
    const n = list.length;
    const words = list.reduce((a, r) => a + r.words, 0);
    const secs = list.reduce((a, r) => a + r.seconds, 0);
    return {
      date: d,
      count: n,
      wpm: secs ? Math.round(words / (secs / 60)) : 0,
      fillersPer100: words ? round1((list.reduce((a, r) => a + r.fillers, 0) / words) * 100) : 0,
      restarts: n ? round1(list.reduce((a, r) => a + r.restarts, 0) / n) : 0,
      pauses: n ? round1(list.reduce((a, r) => a + r.pauses, 0) / n) : 0,
    };
  });
}

/** Dictation accuracy per day (average %, 0 = no dictation that day) and overall recent average. */
export function dictationByDay(s: AppState, days: string[]) {
  const recs = (s.listens || []).filter((l) => l.dictationAccuracy != null);
  return days.map((d) => {
    const list = recs.filter((l) => l.date === d);
    return { date: d, count: list.length, accuracy: list.length ? Math.round(list.reduce((a, l) => a + (l.dictationAccuracy || 0), 0) / list.length) : 0 };
  });
}

export function listeningStats(s: AppState) {
  const ls = s.listens || [];
  const dict = ls.filter((l) => l.dictationAccuracy != null).sort((a, b) => b.createdAt - a.createdAt);
  const q = ls.filter((l) => l.questionScore != null);
  const qTotal = q.reduce((a, l) => a + l.drill.questions.length, 0);
  const recent = dict.slice(0, 5);
  return {
    sessions: ls.length,
    dictations: dict.length,
    recentAccuracy: recent.length ? Math.round(recent.reduce((a, l) => a + (l.dictationAccuracy || 0), 0) / recent.length) : null,
    questionPct: qTotal ? Math.round((q.reduce((a, l) => a + (l.questionScore || 0), 0) / qTotal) * 100) : null,
    retells: ls.filter((l) => l.retell).length,
  };
}
