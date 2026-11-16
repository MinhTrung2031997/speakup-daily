import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppState, Phrase, PhraseItem, ShadowAttemptInput } from './types';
import { todayStr, uid } from './date';
import { initialDue } from './srs';
import { cleanPhrase } from './diff';
import { setDemoMode } from './gemini';
import { supabase } from './supabase';
import { DEFAULT_PROFILE, PRESET_TOPICS, importLegacy, loadState, resetAll, saveShadowAttempt, syncChanges, type ImportSummary } from './db';

export { PRESET_TOPICS };

/** Where the old (pre-Supabase) version kept everything in the browser. */
export const STORAGE_KEY = 'speakup:v1';
const importedKey = (userId: string) => `speakup:v1:imported:${userId}`;

export function defaultState(): AppState {
  return {
    version: 1,
    profile: { ...DEFAULT_PROFILE },
    topics: PRESET_TOPICS.map((t) => ({ ...t })),
    settings: { model: 'gemini-flash-lite-latest', dark: false, voiceURI: '', rate: 1, onboarded: false, fastMode: true, demo: false },
    questions: [],
    entries: [],
    phrases: [],
    chats: [],
    listens: [],
    speakingLog: {},
    activityLog: {},
  };
}

/** Merge loaded data with defaults so older/partial backups still work. */
export function normalizeState(raw: unknown): AppState {
  const d = defaultState();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<AppState>;
  const { apiKey: _ignored, ...settings } = (r.settings || {}) as Partial<AppState['settings']> & { apiKey?: string };
  return {
    version: 1,
    profile: { ...d.profile, ...(r.profile || {}) },
    topics: Array.isArray(r.topics) && r.topics.length ? r.topics : d.topics,
    settings: { ...d.settings, ...settings },
    questions: Array.isArray(r.questions) ? r.questions : [],
    entries: Array.isArray(r.entries) ? r.entries : [],
    phrases: Array.isArray(r.phrases) ? r.phrases : [],
    chats: Array.isArray(r.chats) ? r.chats : [],
    listens: Array.isArray(r.listens) ? r.listens : [],
    speakingLog: r.speakingLog && typeof r.speakingLog === 'object' ? r.speakingLog : {},
    activityLog: r.activityLog && typeof r.activityLog === 'object' ? r.activityLog : {},
  };
}

/** Old browser-storage data that hasn't been imported for this user yet (or null). */
export function pendingLegacyData(userId: string): AppState | null {
  try {
    if (localStorage.getItem(importedKey(userId))) return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = normalizeState(JSON.parse(raw));
    const p = s.profile;
    const hasData = s.questions.length || s.entries.length || s.phrases.length || s.chats.length || p.name || p.job || p.facts;
    return hasData ? s : null;
  } catch {
    return null;
  }
}

type Updater = (s: AppState) => AppState;

interface Store {
  state: AppState;
  userId: string;
  email: string;
  update: (fn: Updater) => void;
  addSpeaking: (seconds: number) => void;
  logActivity: () => void;
  addPhrases: (items: PhraseItem[], source: string) => number;
  saveShadow: (a: ShadowAttemptInput) => void;
  /** Copy a backup / old browser data into the database, then reload. */
  importData: (data: AppState, fromBrowser?: boolean) => Promise<ImportSummary>;
  dismissBrowserImport: () => void;
  legacy: AppState | null;
  resetData: () => Promise<void>;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
  saving: boolean;
  saveError: string;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ userId, email, children }: { userId: string; email: string; children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [legacy, setLegacy] = useState<AppState | null>(() => pendingLegacyData(userId));
  const stateRef = useRef<AppState | null>(null);
  const baseRef = useRef<AppState | null>(null); // last state known to be in the database
  const running = useRef<Promise<void> | null>(null);
  stateRef.current = state;

  const load = useCallback(async () => {
    setLoadError('');
    try {
      if (running.current) await running.current;
      const s = await loadState(userId);
      baseRef.current = s;
      stateRef.current = s;
      setState(s);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  /** Save loop: keeps writing until the database matches the latest state. */
  const flush = useCallback(() => {
    if (running.current) return running.current;
    let failed = false;
    const run: Promise<void> = (async () => {
      await Promise.resolve(); // let `running.current = run` happen first
      setSaving(true);
      try {
        while (stateRef.current && baseRef.current && stateRef.current !== baseRef.current) {
          const target = stateRef.current;
          await syncChanges(userId, baseRef.current, target);
          baseRef.current = target;
        }
        setSaveError('');
      } catch (e) {
        failed = true;
        console.error(e);
        setSaveError(`Some changes were not saved to the cloud (${e instanceof Error ? e.message : String(e)}). Check your connection; we'll retry on your next change.`);
      } finally {
        running.current = null;
        setSaving(false);
      }
      // A change may have arrived just as the loop finished.
      if (!failed && stateRef.current !== baseRef.current) await flushRef.current();
    })();
    running.current = run;
    return run;
  }, [userId]);
  const flushRef = useRef(flush);
  flushRef.current = flush;

  useEffect(() => {
    if (!state) return;
    document.documentElement.classList.toggle('dark', state.settings.dark);
    try { localStorage.setItem('speakup.dark', state.settings.dark ? '1' : '0'); } catch { /* ignore */ }
    setDemoMode(state.settings.demo);
    if (state !== baseRef.current) flush();
  }, [state, flush]);

  // Warn before closing the tab while a save is in progress.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (running.current) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  const update = useCallback((fn: Updater) => setState((s) => {
    if (!s) return s;
    const next = fn(s);
    stateRef.current = next;
    return next;
  }), []);

  const addSpeaking = useCallback((seconds: number) => {
    if (!seconds || seconds < 1) return;
    const d = todayStr();
    update((s) => ({ ...s, speakingLog: { ...s.speakingLog, [d]: (s.speakingLog[d] || 0) + Math.round(seconds) } }));
  }, [update]);

  const logActivity = useCallback(() => {
    const d = todayStr();
    update((s) => ({ ...s, activityLog: { ...s.activityLog, [d]: (s.activityLog[d] || 0) + 1 } }));
  }, [update]);

  const addPhrases = useCallback((items: PhraseItem[], source: string) => {
    // Compute synchronously from the latest state so we can report how many were added.
    const cur = stateRef.current;
    if (!cur) return 0;
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
      update((s) => {
        const keys = new Set(s.phrases.map((p) => cleanPhrase(p.phrase).toLowerCase()));
        const add = fresh.filter((f) => !keys.has(cleanPhrase(f.phrase).toLowerCase()));
        return { ...s, phrases: [...add, ...s.phrases] };
      });
    }
    return fresh.length;
  }, [update]);

  const saveShadow = useCallback((a: ShadowAttemptInput) => {
    saveShadowAttempt(userId, a).catch((e) => {
      console.error(e);
      setSaveError(`A shadowing attempt was not saved (${e instanceof Error ? e.message : String(e)}).`);
    });
  }, [userId]);

  const importData = useCallback(async (data: AppState, fromBrowser = false) => {
    await flush();
    const cur = stateRef.current || defaultState();
    const sum = await importLegacy(userId, normalizeState(data), cur);
    if (fromBrowser) {
      try { localStorage.setItem(importedKey(userId), new Date().toISOString()); } catch { /* ignore */ }
      setLegacy(null);
    }
    await load();
    return sum;
  }, [userId, flush, load]);

  const dismissBrowserImport = useCallback(() => {
    try { localStorage.setItem(importedKey(userId), 'dismissed'); } catch { /* ignore */ }
    setLegacy(null);
  }, [userId]);

  const resetData = useCallback(async () => {
    await flush();
    await resetAll(userId);
    await load();
  }, [userId, flush, load]);

  const signOut = useCallback(async () => {
    await flush();
    await supabase.auth.signOut();
  }, [flush]);

  const value = useMemo(
    () => (state ? { state, userId, email, update, addSpeaking, logActivity, addPhrases, saveShadow, importData, dismissBrowserImport, legacy, resetData, reload: load, signOut, saving, saveError } : null),
    [state, userId, email, update, addSpeaking, logActivity, addPhrases, saveShadow, importData, dismissBrowserImport, legacy, resetData, load, signOut, saving, saveError],
  );

  if (!value) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
        {loadError ? (
          <>
            <p className="font-semibold text-rose-600 dark:text-rose-300">Could not load your practice data.</p>
            <p className="muted max-w-md text-sm">{loadError}</p>
            <div className="flex gap-2">
              <button className="btn-primary" onClick={load}>Try again</button>
              <button className="btn-ghost" onClick={() => supabase.auth.signOut()}>Sign out</button>
            </div>
          </>
        ) : (
          <>
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-200 border-t-blue-600" />
            <p className="muted text-sm">Loading your practice…</p>
          </>
        )}
      </div>
    );
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const c = useContext(Ctx);
  if (!c) throw new Error('StoreProvider missing');
  return c;
}
