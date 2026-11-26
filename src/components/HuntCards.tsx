// Word tracker pieces on the practice pages: "Try to use today" chips on the daily question, and the short
// result after a spoken answer (Natural / Forced / Misused / Not used, with the exact clause as evidence).
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../lib/store';
import { todayStr, uid } from '../lib/date';
import { phraseInText } from '../lib/learnPrompts';
import { ACTIVE_AT, TARGETS_PER_DAY, huntKey, naturalCount, pickTargets } from '../lib/hunt';
import type { HuntLevel } from '../lib/wordHunt';
import { Spinner } from './ui';

export const HUNT_UI: Record<HuntLevel, { icon: string; label: string; cls: string }> = {
  natural: { icon: '✅', label: 'Natural', cls: 'text-emerald-700 dark:text-emerald-300' },
  forced: { icon: '😬', label: 'Forced', cls: 'text-amber-700 dark:text-amber-300' },
  misused: { icon: '⚠️', label: 'Misused', cls: 'text-rose-700 dark:text-rose-300' },
  absent: { icon: '➖', label: 'Not used', cls: 'text-slate-500' },
};

/** 🎯 Today's (up to 3) target words, picked once a day from his saved phrases that are not active yet. */
export function HuntChips({ question }: { question: string }) {
  const { state, update } = useStore();
  const today = todayStr();
  const day = state.hunt.days.find((d) => d.date === today);
  const [open, setOpen] = useState<string | null>(null);
  const made = useRef(0);

  // Create today's targets once. If he saves more phrases later the same day and fewer than 3 were picked, top up (never swap).
  useEffect(() => {
    if (!state.phrases.length) return;
    const have = day?.targets || [];
    if (have.length >= TARGETS_PER_DAY || made.current === state.phrases.length) return;
    const pool = pickTargets(state.phrases, state.hunt.uses, state.hunt.days, question, today, TARGETS_PER_DAY + have.length);
    const extra = pool.filter((t) => !have.some((h) => huntKey(h.phrase) === huntKey(t.phrase))).slice(0, TARGETS_PER_DAY - have.length);
    made.current = state.phrases.length;
    if (!extra.length) return;
    update((s) => {
      const cur = s.hunt.days.find((d) => d.date === today);
      if (!cur) return { ...s, hunt: { ...s.hunt, days: [...s.hunt.days, { id: uid(), date: today, targets: extra, createdAt: Date.now() }] } };
      if (cur.targets.length >= TARGETS_PER_DAY) return s;
      return { ...s, hunt: { ...s.hunt, days: s.hunt.days.map((d) => (d.id === cur.id ? { ...d, targets: [...d.targets, ...extra.filter((e) => !d.targets.some((h) => huntKey(h.phrase) === huntKey(e.phrase)))] } : d)) } };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day?.targets.length, state.phrases.length, question]);

  const targets = (day?.targets || []).filter((t) => !phraseInText(t.phrase, question));
  if (!targets.length) return null;
  const meaning = targets.find((t) => t.phrase === open)?.meaning;
  return (
    <div className="mt-4" data-testid="hunt-chips">
      <p className="mb-1.5 flex flex-wrap items-center gap-x-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <span>🎯 Try to use today</span>
        <Link to="/progress#words" className="font-medium normal-case tracking-normal text-blue-600 hover:underline dark:text-blue-400">Word tracker →</Link>
      </p>
      <div className="flex flex-wrap gap-2">
        {targets.map((t) => {
          const n = naturalCount(state.hunt.uses, t.phrase);
          return (
            <button key={t.phrase} type="button" onClick={() => setOpen(open === t.phrase ? null : t.phrase)} aria-expanded={open === t.phrase} data-testid="hunt-chip"
              className="chip bg-amber-100 text-amber-900 hover:bg-amber-200 dark:bg-amber-400/15 dark:text-amber-200">
              {t.phrase} <span className="opacity-60">{Math.min(n, ACTIVE_AT)}/{ACTIVE_AT}</span>
            </button>
          );
        })}
      </div>
      {open && <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-300" data-testid="hunt-meaning">{meaning || 'Use it naturally if it fits what you want to say.'}</p>}
    </div>
  );
}

/** Short result of the word hunt for one answer (identified by `refId`). */
export function HuntResult({ refId, busy, error }: { refId: string; busy?: string | null; error?: string }) {
  const { state } = useStore();
  const uses = state.hunt.uses.filter((u) => u.ref === refId);
  const running = busy === refId;
  if (!uses.length && !running && !error) return null;
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm dark:border-amber-400/20 dark:bg-amber-400/5" data-testid="hunt-result">
      <p className="font-semibold text-slate-900 dark:text-white">🎯 Your target words</p>
      {running && <p className="mt-1 flex items-center gap-2 text-slate-500"><Spinner className="h-3.5 w-3.5" /> Checking how you used them…</p>}
      {!running && error && !uses.length && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Couldn't check your target words this time. {error}</p>}
      <ul className="mt-1.5 space-y-2">
        {uses.map((u) => {
          const ui = HUNT_UI[u.level];
          const n = naturalCount(state.hunt.uses, u.phrase);
          return (
            <li key={u.id} data-testid="hunt-use" data-level={u.level}>
              <p className="flex flex-wrap items-center gap-x-2">
                <span aria-hidden>{ui.icon}</span><span className="font-semibold">{u.phrase}</span>
                <span className={`text-xs font-medium ${ui.cls}`}>{ui.label}</span>
                <span className="text-xs text-slate-500">{n >= ACTIVE_AT ? '🎉 Active now!' : `${n}/${ACTIVE_AT} natural uses`}</span>
              </p>
              {u.evidence && <p className="ml-6 italic text-slate-600 dark:text-slate-300">“{u.evidence}”</p>}
              {u.note && u.level !== 'absent' && <p className="ml-6 text-xs text-slate-500">{u.note}</p>}
              {u.better && <p className="ml-6 text-xs"><span className="font-semibold uppercase tracking-wide opacity-70">Try:</span> {u.better}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
