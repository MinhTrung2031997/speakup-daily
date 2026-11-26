// Word tracker logic (all counting is in code; the AI only grades a use and suggests swaps).
// A target word becomes "active" after a Natural use in 3 different answers.
import { addDays } from './date';
import { cleanPhrase } from './diff';
import { phraseInText } from './learnPrompts';
import { FILLERS, OVERUSED_CANDIDATES } from './wordHunt';
import type { AppState, HuntDay, HuntTarget, HuntUse, Phrase } from './types';

export const ACTIVE_AT = 3;
export const TARGETS_PER_DAY = 3;
export const huntKey = (p: string) => cleanPhrase(p).toLowerCase();

/** phrase key -> distinct answers (refs) where it was used Natural. */
export function naturalRefs(uses: HuntUse[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const u of uses) {
    if (u.level !== 'natural') continue;
    const k = huntKey(u.phrase);
    if (!m.has(k)) m.set(k, new Set());
    m.get(k)!.add(u.ref);
  }
  return m;
}
export const naturalCount = (uses: HuntUse[], phrase: string) => naturalRefs(uses).get(huntKey(phrase))?.size || 0;

/** Date of the Nth distinct Natural answer per phrase (when it became active). */
export function activationDates(uses: HuntUse[]): Map<string, string> {
  const seen = new Map<string, Set<string>>();
  const out = new Map<string, string>();
  for (const u of [...uses].filter((x) => x.level === 'natural').sort((a, b) => a.createdAt - b.createdAt)) {
    const k = huntKey(u.phrase);
    if (out.has(k)) continue;
    if (!seen.has(k)) seen.set(k, new Set());
    seen.get(k)!.add(u.ref);
    if (seen.get(k)!.size >= ACTIVE_AT) out.set(k, u.date);
  }
  return out;
}

/** Pick today's targets from his saved phrases: not active yet, not spelled out in the question, rotated, one in-progress word first. */
export function pickTargets(phrases: Phrase[], uses: HuntUse[], days: HuntDay[], question: string, date: string, n = TARGETS_PER_DAY): HuntTarget[] {
  const counts = naturalRefs(uses);
  const recent = new Set<string>();
  for (const d of days) if (d.date < date && d.date >= addDays(date, -2)) d.targets.forEach((t) => recent.add(huntKey(t.phrase)));
  const pool = phrases
    .filter((p) => {
      const k = huntKey(p.phrase);
      return k && p.phrase.trim().split(/\s+/).length <= 6 && (counts.get(k)?.size || 0) < ACTIVE_AT && !phraseInText(p.phrase, question);
    })
    .sort((a, b) => b.createdAt - a.createdAt);
  const prog = (p: Phrase) => counts.get(huntKey(p.phrase))?.size || 0;
  const fresh = pool.filter((p) => !recent.has(huntKey(p.phrase)));
  const inProgress = fresh.filter((p) => prog(p) > 0);
  const ordered = [...inProgress.slice(0, 1), ...fresh.filter((p) => !inProgress.slice(0, 1).includes(p)), ...pool.filter((p) => recent.has(huntKey(p.phrase)))];
  return ordered.slice(0, n).map((p) => ({ phrase: p.phrase, meaning: p.meaning || '' }));
}

// ---------------- Overused words (counted in code, no AI) ----------------
export interface SpokenAnswer { id: string; date: string; text: string; at: number }

/** Everything he said out loud (answers, retries, replays, builder tries, Say it better, Words) as plain transcripts. */
export function spokenAnswers(s: AppState): SpokenAnswer[] {
  const out: SpokenAnswer[] = [];
  for (const e of s.entries) {
    if ((e.fluency || e.pronunciation) && e.answer.trim()) out.push({ id: `a:${e.id}`, date: e.date, text: e.answer, at: e.createdAt });
    if (e.retry?.fluency && e.retry.attempt?.trim()) out.push({ id: `r:${e.id}`, date: e.date, text: e.retry.attempt, at: e.createdAt + 1 });
  }
  for (const x of s.saySessions || []) if (x.grade?.voiced && x.grade.transcript.trim()) out.push({ id: `s:${x.id}`, date: x.date, text: x.grade.transcript, at: x.grade.gradedAt || x.createdAt });
  for (const w of s.wordSessions || []) w.items.forEach((it, i) => { if (it?.voiced && it.sentence?.trim()) out.push({ id: `w:${w.id}:${i}`, date: w.date, text: it.sentence, at: w.createdAt + i }); });
  return out.sort((a, b) => a.at - b.at);
}

const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** How many times `phrase` appears in `text` (case-insensitive, whole words). */
export function countPhrase(text: string, phrase: string): number {
  const re = new RegExp(`(?<![a-z'])${esc(phrase.toLowerCase()).replace(/\s+/g, '\\s+')}(?![a-z'])`, 'g');
  return (text.toLowerCase().replace(/[’`]/g, "'").match(re) || []).length;
}

export interface OverusedRow { word: string; total: number; inAnswers: number; max: number; recentPerAnswer: number; earlierPerAnswer: number; trend: 'up' | 'down' | 'flat' | 'new' }
export interface OverusedReport { answers: number; rows: OverusedRow[]; fillers: { word: string; total: number }[]; fillerPerAnswer: number }

export const MIN_ANSWERS = 3;
export const WINDOW = 10;

/** Flag a word when it is in >=40% of his last 10 answers or >=3 times in one answer. Top 5 by count. */
export function analyzeOverused(answers: SpokenAnswer[]): OverusedReport {
  const last = answers.slice(-WINDOW);
  const n = last.length;
  const half = Math.min(5, Math.floor(n / 2));
  const recent = last.slice(n - half);
  const earlier = last.slice(0, n - half);
  const per = (list: SpokenAnswer[], w: string) => (list.length ? list.reduce((t, a) => t + countPhrase(a.text, w), 0) / list.length : 0);
  const rows: OverusedRow[] = [];
  if (n >= MIN_ANSWERS) {
    for (const w of OVERUSED_CANDIDATES) {
      const counts = last.map((a) => countPhrase(a.text, w));
      const total = counts.reduce((a, b) => a + b, 0);
      const inAnswers = counts.filter((c) => c > 0).length;
      const max = Math.max(0, ...counts);
      if (!total || !(inAnswers / n >= 0.4 || max >= 3)) continue;
      const r = per(recent, w), e = per(earlier, w);
      const trend: OverusedRow['trend'] = n < 6 ? 'new' : r - e > 0.3 ? 'up' : e - r > 0.3 ? 'down' : 'flat';
      rows.push({ word: w, total, inAnswers, max, recentPerAnswer: r, earlierPerAnswer: e, trend });
    }
  }
  rows.sort((a, b) => b.total - a.total || b.inAnswers - a.inAnswers);
  const fillers = FILLERS.map((w) => ({ word: w, total: last.reduce((t, a) => t + countPhrase(a.text, w), 0) })).filter((f) => f.total > 0).sort((a, b) => b.total - a.total);
  return { answers: n, rows: rows.slice(0, 5), fillers, fillerPerAnswer: n ? fillers.reduce((t, f) => t + f.total, 0) / n : 0 };
}

/** Up to 2 of his own sentences that contain the word (for the swaps prompt). */
export function sentencesWith(answers: SpokenAnswer[], word: string, max = 2): string[] {
  const out: string[] = [];
  for (const a of [...answers].reverse()) {
    for (const s of a.text.split(/(?<=[.!?])\s+|\s*,\s+(?=(?:and|but|so)\b)/i)) {
      if (countPhrase(s, word) > 0 && s.trim().split(/\s+/).length >= 4) { out.push(s.trim()); if (out.length >= max) return out; }
    }
  }
  return out;
}
