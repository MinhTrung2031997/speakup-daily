import { useMemo } from 'react';
import { useStore } from './store';
import type { GeminiConfig } from './gemini';
import { todayStr } from './date';
import type { AppState } from './types';

export function useAIConfig(): GeminiConfig & { hasKey: boolean } {
  const { state } = useStore();
  const { apiKey, model, fastMode } = state.settings;
  return useMemo(() => ({ apiKey, model, fastMode, hasKey: !!apiKey.trim() }), [apiKey, model, fastMode]);
}

/** The current question for today (the most recent one created today). */
export function todaysQuestion(state: AppState) {
  const t = todayStr();
  const list = state.questions.filter((q) => q.date === t);
  return list[list.length - 1];
}

/** Phrases from today's upgrades (fallback: newest phrases in the bank). */
export function todaysPhrases(state: AppState): string[] {
  const t = todayStr();
  const fromToday = state.entries.filter((e) => e.date === t).flatMap((e) => e.upgrade?.phrases.map((p) => p.phrase) || []);
  const list = fromToday.length ? fromToday : state.phrases.slice(0, 5).map((p) => p.phrase);
  return Array.from(new Set(list)).slice(0, 6);
}
