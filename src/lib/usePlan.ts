import { useEffect, useState } from 'react';
import { useStore } from './store';
import { todayStr } from './date';
import { buildPlan, missingAnswerReviews, refreshPlan } from './plan';
import type { DailyPlan } from './types';

/** Keeps today's plan (built once per local day) and the answer-review rows up to date. Mounted once in Layout. */
export function usePlanKeeper() {
  const { state, update } = useStore();
  const [today, setToday] = useState(todayStr());
  useEffect(() => {
    const t = setInterval(() => setToday(todayStr()), 60_000);
    const vis = () => document.visibilityState === 'visible' && setToday(todayStr());
    document.addEventListener('visibilitychange', vis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', vis); };
  }, []);
  useEffect(() => {
    const missing = missingAnswerReviews(state);
    const cur = (state.plans || []).find((p) => p.date === today);
    const base = missing.length ? { ...state, answerReviews: [...(state.answerReviews || []), ...missing] } : state;
    const next = cur ? refreshPlan(base, cur, today) : buildPlan(base, today);
    if (!missing.length && next === cur) return;
    update((s) => {
      const reviews = missing.length ? [...(s.answerReviews || []).filter((r) => !missing.some((m) => m.answerId === r.answerId)), ...missing] : s.answerReviews;
      const plans = next === cur ? s.plans : [...(s.plans || []).filter((p) => p.date !== today), next].sort((a, b) => a.date.localeCompare(b.date));
      return { ...s, answerReviews: reviews, plans };
    });
  }, [state, today, update]);
}

export function useTodayPlan(): DailyPlan | undefined {
  const { state } = useStore();
  const t = todayStr();
  return (state.plans || []).find((p) => p.date === t);
}
