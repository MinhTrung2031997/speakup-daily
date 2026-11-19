import { useRef, useState } from 'react';
import { useStore, normalizeState } from '../lib/store';
import RecordingPlayer from '../components/RecordingPlayer';
import TopicsEditor from '../components/TopicsEditor';
import { speakNatural, spokenQuestion } from '../lib/tts';
import { testKey } from '../lib/ai';
import { errorText } from '../lib/gemini';
import { useEnglishVoices, ttsSupported, speechRecognitionSupported, preferredAccent } from '../lib/speech';
import { todayStr } from '../lib/date';
import { PageTitle, Spinner } from '../components/ui';
import Icon from '../components/Icon';

const MODELS = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];

export default function Settings() {
  const { state, update, importData, resetData, signOut, email, saving } = useStore();
  const s = state.settings;
  const [model, setModel] = useState(s.model);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [importMsg, setImportMsg] = useState('');
  const [importing, setImporting] = useState(false);
  const [resetting, setResetting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const voices = useEnglishVoices();

  const set = (patch: Partial<typeof s>) => update((st) => ({ ...st, settings: { ...st.settings, ...patch } }));
  const saveAI = () => { set({ model: model.trim() || 'gemini-flash-lite-latest' }); setMsg({ ok: true, text: 'Saved ✓' }); };
  const check = async () => {
    setTesting(true);
    setMsg(null);
    try {
      const m = await testKey({ model: model.trim() || 'gemini-flash-lite-latest', fastMode: s.fastMode, demo: s.demo });
      set({ model: model.trim() || 'gemini-flash-lite-latest' });
      setMsg({ ok: true, text: `Connected: "${m}"` });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setTesting(false);
    }
  };

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `speakup-daily-backup-${todayStr()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importFile = async (file: File) => {
    setImportMsg('');
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || !('profile' in parsed || 'entries' in parsed || 'phrases' in parsed)) throw new Error('This does not look like a SpeakUp Daily backup.');
      setImporting(true);
      const r = await importData(normalizeState(parsed));
      setImportMsg(`Imported ✓ ${r.answers} new answers, ${r.phrases} new phrases, ${r.chats} new chats (items you already had were skipped).`);
    } catch (e) {
      setImportMsg(`Import failed: ${errorText(e)}`);
    } finally {
      setImporting(false);
    }
  };

  const reset = async () => {
    if (!(confirm('Delete ALL your SpeakUp Daily practice from your account? Export a backup first if you want to keep it.') && confirm('Are you sure? This cannot be undone.'))) return;
    setResetting(true);
    try { await resetData(); } catch (e) { alert(`Could not delete everything: ${errorText(e)}`); } finally { setResetting(false); }
  };

  return (
    <div className="space-y-4">
      <PageTitle title="Settings" />

      <section className="card space-y-3">
        <h2 className="h-section">👤 Account</h2>
        <p className="text-sm">Signed in as <b>{email || 'you'}</b>. Your practice is saved to your account automatically{saving ? ' (saving…)' : ''}.</p>
        <button className="btn-ghost w-fit" onClick={() => signOut()}>Sign out</button>
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="h-section">🤖 AI</h2>
          <p className="muted">The AI (Google Gemini) runs on our server, so you don't need your own key.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-blue-600" checked={s.demo} onChange={(e) => { set({ demo: e.target.checked }); setMsg(null); }} />
          Demo mode (sample AI answers on this device, no real feedback)
        </label>
        <div>
          <label className="label">Model</label>
          <input className="input font-mono" list="models" value={model} onChange={(e) => setModel(e.target.value)} />
          <datalist id="models">{MODELS.map((m) => <option key={m} value={m} />)}</datalist>
          <p className="mt-1 text-xs text-slate-500">Default: gemini-flash-lite-latest (fast). If a model is unavailable or slow, the server switches automatically.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-blue-600" checked={s.fastMode} onChange={(e) => set({ fastMode: e.target.checked })} />
          Fast mode (turn off "thinking" on 2.5 Flash models for quicker replies)
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" onClick={saveAI}>Save</button>
          <button className="btn-soft" onClick={check} disabled={testing}>{testing ? <Spinner /> : <Icon name="check" className="h-4 w-4" />} Test connection</button>
          {msg && <span className={`text-sm ${msg.ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}`}>{msg.text}</span>}
        </div>
      </section>

      <QuestionVoiceCard />

      <section className="card space-y-3">
        <h2 className="h-section">🎨 Look &amp; sound</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-blue-600" checked={s.dark} onChange={(e) => set({ dark: e.target.checked })} /> Dark mode
        </label>
        {ttsSupported() ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Read-aloud voice</label>
              <select className="input" value={s.voiceURI} onChange={(e) => set({ voiceURI: e.target.value })}>
                <option value="">Default English voice</option>
                {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name} ({v.lang})</option>)}
              </select>
            </div>
            <div>
              <label className="label">Speed: {s.rate.toFixed(2)}x</label>
              <input type="range" min={0.75} max={1.25} step={0.05} value={s.rate} onChange={(e) => set({ rate: Number(e.target.value) })} className="w-full accent-blue-600" />
            </div>
            <button className="btn-soft w-fit" onClick={() => speakNatural("Hi! The thing is, practice makes progress, not perfect.", { voiceURI: s.voiceURI, rate: s.rate })}><Icon name="play" className="h-4 w-4" /> Test voice</button>
          </div>
        ) : (
          <p className="muted">Read-aloud isn't supported in this browser.</p>
        )}
        <p className="text-xs text-slate-500">
          Voice input (speech-to-text): {speechRecognitionSupported() ? '✅ supported in this browser' : '❌ not supported here. Use Chrome, Edge or Safari for the mic.'}
        </p>
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="h-section">💾 Backup</h2>
          <p className="muted">Everything is saved in your account. You can still download a JSON copy, or import a backup file (it's added to your account; anything you already have is skipped).</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-soft" onClick={exportData}><Icon name="download" className="h-4 w-4" /> Export JSON</button>
          <button className="btn-soft" onClick={() => fileRef.current?.click()} disabled={importing}>{importing ? <Spinner /> : <Icon name="upload" className="h-4 w-4" />} Import JSON</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importFile(f); e.target.value = ''; }} />
        </div>
        {importMsg && <p className="text-sm">{importMsg}</p>}
      </section>

      <section className="card space-y-3" data-testid="daily-topics">
        <div>
          <h2 className="h-section">🗂️ Daily question topics</h2>
          <p className="muted">Tap a topic to turn it on or off for the daily question. ⭐ favourites come up 3× as often. Each topic has its own set of questions, asked in turn before the AI writes new ones.</p>
          <p className="mt-1 text-xs text-slate-500">{state.topics.filter((t) => t.active).length} of {state.topics.length} on · {state.topics.filter((t) => t.active && t.favorite).length} favourite</p>
        </div>
        <TopicsEditor topics={state.topics} onChange={(topics) => update((s) => ({ ...s, topics }))} />
      </section>

      <RecordingsCard />

      <section className="card space-y-3">
        <h2 className="h-section">⚠️ Danger zone</h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => set({ onboarded: false })}>Show welcome screen again</button>
          <button className="btn-danger" onClick={reset} disabled={resetting}>{resetting ? <Spinner /> : <Icon name="trash" className="h-4 w-4" />} Delete all practice data</button>
        </div>
      </section>
      <p className="pb-4 text-center text-xs text-slate-400">SpeakUp Daily · your practice is saved to your account</p>
    </div>
  );
}

/** Hear the question asked aloud (natural AI voice, US / UK) + Listening mode. */
function QuestionVoiceCard() {
  const { state, update } = useStore();
  const s = state.settings;
  const set = (patch: Partial<typeof s>) => update((st) => ({ ...st, settings: { ...st.settings, ...patch } }));
  const [accent, setAccentState] = useState<'US' | 'UK'>(preferredAccent());
  const [testing, setTesting] = useState(false);
  const setAccent = (a: 'US' | 'UK') => {
    setAccentState(a);
    try { const p = JSON.parse(localStorage.getItem('speakup.listen') || '{}'); localStorage.setItem('speakup.listen', JSON.stringify({ ...p, accent: a })); } catch { /* ignore */ }
  };
  const test = async () => {
    setTesting(true);
    await speakNatural(spokenQuestion('What does a productive day look like for you?', state.profile.name), { accent, voiceURI: s.voiceURI });
    setTesting(false);
  };
  return (
    <section className="card space-y-3" data-testid="voice-card">
      <h2 className="h-section">🔊 Hear the question</h2>
      <p className="muted">A natural voice asks you the question, like a friend on a voice chat. If it can't load, your browser's voice reads it.</p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-blue-600" checked={s.askAloud !== false} onChange={(e) => set({ askAloud: e.target.checked })} data-testid="ask-aloud-setting" /> Play the question when it opens
      </label>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-0.5 accent-blue-600" checked={!!s.listeningMode} onChange={(e) => set({ listeningMode: e.target.checked })} data-testid="listening-setting" />
        <span>Listening mode <span className="block text-xs text-slate-500">Hide the question text until you've answered, so you understand it by ear (you can still tap Show text).</span></span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm">Accent:</span>
        {(['US', 'UK'] as const).map((a) => (
          <button key={a} onClick={() => setAccent(a)} aria-pressed={accent === a} className={`rounded-full border px-3 py-1 text-sm ${accent === a ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500 dark:text-slate-950' : 'border-slate-300 dark:border-slate-700'}`}>{a === 'US' ? '🇺🇸 US' : '🇬🇧 UK'}</button>
        ))}
        <button className="btn-soft !py-1.5 text-sm" onClick={test} disabled={testing}>{testing ? <Spinner /> : <Icon name="play" className="h-4 w-4" />} Test</button>
      </div>
      <p className="text-xs text-slate-500">The accent is shared with the Listen tab.</p>
    </section>
  );
}

const FREE_BYTES = 1024 * 1024 * 1024; // Supabase free plan: 1 GB of file storage

/** Storage use of saved recordings (kept permanently) + a list to play / star / delete them. */
function RecordingsCard() {
  const { state } = useStore();
  const [shown, setShown] = useState(10);
  const recs = [...state.recordings].sort((a, b) => b.createdAt - a.createdAt);
  const bytes = recs.reduce((n, r) => n + (r.bytes || 0), 0);
  const mb = bytes / 1024 / 1024;
  const pct = Math.min(100, (bytes / FREE_BYTES) * 100);
  const starred = recs.filter((r) => r.starred).length;
  return (
    <section className="card space-y-3" data-testid="recordings-card">
      <h2 className="h-section">🎧 Recordings</h2>
      <p className="text-sm" data-testid="storage-line">Recordings: {recs.length}, about {mb < 0.1 && bytes > 0 ? '0.1' : mb.toFixed(1)} MB of 1 GB{starred ? ` · ⭐ ${starred} starred` : ''}</p>
      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700"><div className="h-full rounded-full bg-blue-600 dark:bg-blue-400" style={{ width: `${Math.max(pct, bytes ? 0.5 : 0)}%` }} /></div>
      <p className="muted text-xs">Your answer, retell and shadowing recordings are kept permanently (small Opus files, about 3 KB per second). Tap ⭐ to mark favourites, or delete any you don't need. Transcripts and scores stay either way.</p>
      {recs.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-medium text-blue-600 dark:text-blue-400">Manage recordings</summary>
          <div className="mt-2 space-y-1.5">
            {recs.slice(0, shown).map((r) => <RecordingPlayer key={r.id} rec={r} compact />)}
            {recs.length > shown && <button className="btn-soft w-full justify-center" onClick={() => setShown((n) => n + 10)}>Show more ({recs.length - shown} left)</button>}
          </div>
        </details>
      )}
    </section>
  );
}
