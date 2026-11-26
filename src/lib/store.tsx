import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { AppState, Phrase, PhraseItem, PhraseOrigin, PronunciationResult, PronWord, RecordingItem, ReviewDrill, ShadowAttemptInput, SoundItem, UsageLevel } from './types';
import type { AudioClip } from './audio';
import { addDays, todayStr, uid } from './date';
import { MASTERED_STAGE, initialDue, scheduleLevel } from './srs';
import { cleanPhrase } from './diff';
import { setDemoMode } from './gemini';
import { supabase } from './supabase';
import { DEFAULT_PROFILE, PRESET_TOPICS, importLegacy, loadState, resetAll, saveShadowAttempt, saveShadowPronunciation, syncChanges, uploadRecording, setRecordingStarred, deleteRecordingItem, type ImportSummary, type RecordingMeta } from './db';

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
    wordSessions: [],
    saySessions: [],
    hunt: { days: [], uses: [], swaps: [] },
    partner: { sessions: [], stories: [] },
    sounds: [],
    recordings: [],
    shadowPron: [],
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
    wordSessions: Array.isArray(r.wordSessions) ? r.wordSessions : [],
    saySessions: Array.isArray(r.saySessions) ? r.saySessions : [],
    partner: { sessions: Array.isArray(r.partner?.sessions) ? r.partner!.sessions : [], stories: Array.isArray(r.partner?.stories) ? r.partner!.stories : [] },
    hunt: { days: Array.isArray(r.hunt?.days) ? r.hunt!.days : [], uses: Array.isArray(r.hunt?.uses) ? r.hunt!.uses : [], swaps: Array.isArray(r.hunt?.swaps) ? r.hunt!.swaps : [] },
    sounds: Array.isArray(r.sounds) ? r.sounds : [],
    recordings: Array.isArray(r.recordings) ? r.recordings : [],
    shadowPron: Array.isArray(r.shadowPron) ? r.shadowPron : [],
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
  addPhrases: (items: PhraseItem[], source: string, origin?: PhraseOrigin) => number;
  /** Record a 3-level review (natural / understandable / off); dates come from srs.scheduleLevel. */
  reviewPhrase: (id: string, r: { level: UsageLevel; sentence: string; feedback: string; drill: ReviewDrill; byVoice: boolean }) => void;
  saveShadow: (a: ShadowAttemptInput) => void;
  /** Attach a pronunciation check to a shadowing take saved with saveShadow({ id }). */
  saveShadowPron: (id: string, p: PronunciationResult) => void;
  /**
   * Save mic clips of an answer / retry / retell in the background (each clip once). Never throws:
   * resolves to how many clips could not be saved (the answer itself is saved either way).
   */
  saveRecordings: (clips: AudioClip[], meta: RecordingMeta) => Promise<number>;
  toggleStar: (id: string) => void;
  removeRecording: (id: string) => Promise<void>;
  /** Add / bump problem words in "Sounds to fix". Returns how many were new. */
  addSounds: (words: PronWord[]) => number;
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

  // Lets tests (and anything else) see whether a cloud save is still running.
  useEffect(() => { document.documentElement.dataset.saving = saving ? '1' : '0'; }, [saving]);

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

  const addPhrases = useCallback((items: PhraseItem[], source: string, origin: PhraseOrigin = 'answer') => {
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
      fresh.push({ phrase: it.phrase, meaning: it.meaning || '', example: it.example || '', id: uid(), source, createdAt: Date.now(), addedDate: today, stage: 0, due: initialDue(today), reviews: [], origin });
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

  const reviewPhrase = useCallback((id: string, r: { level: UsageLevel; sentence: string; feedback: string; drill: ReviewDrill; byVoice: boolean }) => {
    update((s) => ({
      ...s,
      phrases: s.phrases.map((p) => {
        if (p.id !== id) return p;
        const sched = scheduleLevel(p, r.level);
        return {
          ...p, ...sched,
          learnedByVoice: p.learnedByVoice || (r.level === 'natural' && r.byVoice),
          reviews: [...p.reviews, { date: todayStr(), sentence: r.sentence, ok: r.level === 'natural', feedback: r.feedback, level: r.level, drill: r.drill }],
        };
      }),
    }));
  }, [update]);

  const shadowSaves = useRef(new Map<string, Promise<void>>());
  const saveShadow = useCallback((a: ShadowAttemptInput) => {
    const run = saveShadowAttempt(userId, a).then((rec) => {
      if (rec) update((s) => ({ ...s, recordings: [...s.recordings, rec] }));
    }).catch((e) => {
      console.error(e);
      setSaveError(`A shadowing attempt was not saved (${e instanceof Error ? e.message : String(e)}).`);
    });
    if (a.id) shadowSaves.current.set(a.id, run);
  }, [userId, update]);

  // Each clip is uploaded once, even if the answer is upgraded / scored again.
  const uploaded = useRef(new WeakSet<Blob>());
  const saveRecordings = useCallback(async (clips: AudioClip[], meta: RecordingMeta) => {
    let failed = 0;
    for (const c of clips) {
      if (uploaded.current.has(c.blob)) continue;
      uploaded.current.add(c.blob);
      try {
        const rec = await uploadRecording(userId, c, meta);
        update((s) => ({ ...s, recordings: [...s.recordings, rec] }));
      } catch (e) {
        console.warn('Recording not saved:', e);
        uploaded.current.delete(c.blob);
        failed++;
      }
    }
    return failed;
  }, [userId, update]);

  const toggleStar = useCallback((id: string) => {
    const cur = stateRef.current?.recordings.find((r) => r.id === id);
    if (!cur) return;
    const starred = !cur.starred;
    const set = (v: boolean) => update((s) => ({ ...s, recordings: s.recordings.map((r) => (r.id === id ? { ...r, starred: v } : r)) }));
    set(starred);
    setRecordingStarred(id, starred).catch((e) => { console.error(e); set(!starred); setSaveError('Could not update the star. Please try again.'); });
  }, [update]);

  const removeRecording = useCallback(async (id: string) => {
    const cur = stateRef.current?.recordings.find((r) => r.id === id);
    if (!cur) return;
    await deleteRecordingItem(cur as RecordingItem);
    update((s) => ({ ...s, recordings: s.recordings.filter((r) => r.id !== id) }));
  }, [update]);

  const saveShadowPron = useCallback((id: string, p: PronunciationResult) => {
    update((s) => ({ ...s, shadowPron: [...s.shadowPron.filter((x) => x.id !== id), { id, score: p.score, createdAt: p.createdAt }] }));
    (async () => {
      await shadowSaves.current.get(id); // the row must exist first
      await saveShadowPronunciation(id, p);
    })().catch((e) => console.error(e));
  }, [update]);

  const addSounds = useCallback((words: PronWord[]) => {
    const cur = stateRef.current;
    if (!cur || !words.length) return 0;
    const today = todayStr();
    const key = (w: string) => w.trim().toLowerCase();
    const known = new Set(cur.sounds.map((x) => key(x.word)));
    const fresh = new Set(words.map((w) => key(w.word)).filter((k) => k && !known.has(k))).size;
    update((s) => {
      const byWord = new Map(s.sounds.map((x) => [key(x.word), x]));
      const added: SoundItem[] = [];
      for (const w of words) {
        const k = key(w.word);
        if (!k) continue;
        const note = w.tip || '';
        const old = byWord.get(k);
        if (old) {
          // Heard again: refresh the note and bring it back for review soon (even if it was mastered).
          const due = old.stage >= MASTERED_STAGE || old.due > addDays(today, 1) ? addDays(today, 1) : old.due;
          byWord.set(k, {
            ...old, note: note || old.note, ipa: w.ipa || old.ipa, issue: w.issue || old.issue, heard: w.heard || old.heard,
            timesSeen: old.timesSeen + 1, lastSeen: today, stage: Math.min(old.stage, MASTERED_STAGE - 1), due,
          });
        } else {
          const item: SoundItem = { id: uid(), word: w.word.trim(), note, ipa: w.ipa || '', issue: w.issue || '', heard: w.heard || '', timesSeen: 1, lastSeen: today, stage: 0, due: today, createdAt: Date.now() };
          byWord.set(k, item);
          added.push(item);
        }
      }
      const addedIds = new Set(added.map((a) => a.id));
      const updated = s.sounds.map((x) => byWord.get(key(x.word)) || x).filter((x) => !addedIds.has(x.id));
      return { ...s, sounds: [...added, ...updated] };
    });
    return fresh;
  }, [update]);

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
    () => (state ? { state, userId, email, update, addSpeaking, logActivity, addPhrases, reviewPhrase, saveShadow, saveShadowPron, saveRecordings, toggleStar, removeRecording, addSounds, importData, dismissBrowserImport, legacy, resetData, reload: load, signOut, saving, saveError } : null),
    [state, userId, email, update, addSpeaking, logActivity, addPhrases, reviewPhrase, saveShadow, saveShadowPron, saveRecordings, toggleStar, removeRecording, addSounds, importData, dismissBrowserImport, legacy, resetData, load, signOut, saving, saveError],
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
