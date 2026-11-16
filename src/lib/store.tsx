import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppState, Phrase, PhraseItem, Topic } from './types';
import { todayStr, uid } from './date';
import { initialDue } from './srs';
import { cleanPhrase } from './diff';

export const STORAGE_KEY = 'speakup:v1';

export const PRESET_TOPICS: Topic[] = [
  { id: 'work', name: 'Work & Career', emoji: '💼', active: true },
  { id: 'tech', name: 'Technology', emoji: '💻', active: true },
  { id: 'daily', name: 'Daily Life', emoji: '☕', active: true },
  { id: 'travel', name: 'Travel', emoji: '✈️', active: true },
  { id: 'opinions', name: 'Opinions & Debates', emoji: '🗣️', active: true },
  { id: 'hobbies', name: 'Hobbies', emoji: '🎮', active: true },
  { id: 'food', name: 'Food & Culture', emoji: '🍜', active: true },
];

export function defaultState(): AppState {
  return {
    version: 1,
    profile: { name: '', job: '', city: '', hobbies: '', goals: '', level: 'B1–B2 (intermediate)', facts: '' },
    topics: PRESET_TOPICS.map((t) => ({ ...t })),
    settings: { apiKey: '', model: 'gemini-flash-lite-latest', dark: false, voiceURI: '', rate: 1, onboarded: false, fastMode: true },
    questions: [],
    entries: [],
    phrases: [],
    chats: [],
    speakingLog: {},
    activityLog: {},
  };
}

/** Merge loaded data with defaults so older/partial backups still work. */
export function normalizeState(raw: unknown): AppState {
  const d = defaultState();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<AppState>;
  return {
    version: 1,
    profile: { ...d.profile, ...(r.profile || {}) },
    topics: Array.isArray(r.topics) && r.topics.length ? r.topics : d.topics,
    settings: { ...d.settings, ...(r.settings || {}) },
    questions: Array.isArray(r.questions) ? r.questions : [],
    entries: Array.isArray(r.entries) ? r.entries : [],
    phrases: Array.isArray(r.phrases) ? r.phrases : [],
    chats: Array.isArray(r.chats) ? r.chats : [],
    speakingLog: r.speakingLog && typeof r.speakingLog === 'object' ? r.speakingLog : {},
    activityLog: r.activityLog && typeof r.activityLog === 'object' ? r.activityLog : {},
  };
}

function load(): AppState {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? normalizeState(JSON.parse(s)) : defaultState();
  } catch {
    return defaultState();
  }
}

type Updater = (s: AppState) => AppState;

interface Store {
  state: AppState;
  update: (fn: Updater) => void;
  replaceAll: (s: AppState) => void;
  addSpeaking: (seconds: number) => void;
  logActivity: () => void;
  addPhrases: (items: PhraseItem[], source: string) => number;
  saveError: string;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(load);
  const [saveError, setSaveError] = useState('');
  const stateRef = useRef(state);
  stateRef.current = state;
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      setSaveError('');
    } catch {
      setSaveError('Could not save to browser storage (it may be full). Please export a backup in Settings.');
    }
    document.documentElement.classList.toggle('dark', state.settings.dark);
  }, [state]);

  const update = useCallback((fn: Updater) => setState((s) => fn(s)), []);
  const replaceAll = useCallback((s: AppState) => setState(normalizeState(s)), []);

  const addSpeaking = useCallback((seconds: number) => {
    if (!seconds || seconds < 1) return;
    const d = todayStr();
    setState((s) => ({ ...s, speakingLog: { ...s.speakingLog, [d]: (s.speakingLog[d] || 0) + Math.round(seconds) } }));
  }, []);

  const logActivity = useCallback(() => {
    const d = todayStr();
    setState((s) => ({ ...s, activityLog: { ...s.activityLog, [d]: (s.activityLog[d] || 0) + 1 } }));
  }, []);

  const addPhrases = useCallback((items: PhraseItem[], source: string) => {
    // Compute synchronously from the latest state so we can report how many were added.
    const cur = stateRef.current;
    const existing = new Set(cur.phrases.map((p) => cleanPhrase(p.phrase).toLowerCase()));
    const today = todayStr();
    const fresh: Phrase[] = [];
    for (const it of items) {
      const key = cleanPhrase(it.phrase).toLowerCase();
      if (!key || existing.has(key)) continue;
      existing.add(key);
      fresh.push({ ...it, id: uid(), source, createdAt: Date.now(), addedDate: today, stage: 0, due: initialDue(today), reviews: [] });
    }
    if (fresh.length) {
      setState((s) => {
        const keys = new Set(s.phrases.map((p) => cleanPhrase(p.phrase).toLowerCase()));
        const add = fresh.filter((f) => !keys.has(cleanPhrase(f.phrase).toLowerCase()));
        const next = { ...s, phrases: [...add, ...s.phrases] };
        stateRef.current = next;
        return next;
      });
    }
    return fresh.length;
  }, []);

  const value = useMemo(
    () => ({ state, update, replaceAll, addSpeaking, logActivity, addPhrases, saveError }),
    [state, update, replaceAll, addSpeaking, logActivity, addPhrases, saveError],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const c = useContext(Ctx);
  if (!c) throw new Error('StoreProvider missing');
  return c;
}
