import { useRef, useState } from 'react';
import { useStore, normalizeState, defaultState } from '../lib/store';
import { testKey } from '../lib/ai';
import { errorText, isDemoKey } from '../lib/gemini';
import { useEnglishVoices, speak, ttsSupported, speechRecognitionSupported } from '../lib/speech';
import { todayStr } from '../lib/date';
import { PageTitle, Spinner } from '../components/ui';
import Icon from '../components/Icon';

const MODELS = ['gemini-flash-lite-latest', 'gemini-3.5-flash-lite', 'gemini-flash-latest', 'gemini-3.8-flash'];

export default function Settings() {
  const { state, update, replaceAll } = useStore();
  const s = state.settings;
  const [key, setKey] = useState(s.apiKey);
  const [model, setModel] = useState(s.model);
  const [show, setShow] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [includeKey, setIncludeKey] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const voices = useEnglishVoices();

  const set = (patch: Partial<typeof s>) => update((st) => ({ ...st, settings: { ...st.settings, ...patch } }));
  const saveAI = () => { set({ apiKey: key.trim(), model: model.trim() || 'gemini-flash-lite-latest' }); setMsg({ ok: true, text: 'Saved ✓' }); };
  const check = async () => {
    setTesting(true);
    setMsg(null);
    try {
      const m = await testKey({ apiKey: key, model: model.trim() || 'gemini-flash-lite-latest', fastMode: s.fastMode });
      set({ apiKey: key.trim(), model: model.trim() || 'gemini-flash-lite-latest' });
      setMsg({ ok: true, text: `Connected and saved: "${m}"` });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setTesting(false);
    }
  };

  const exportData = () => {
    const data = includeKey ? state : { ...state, settings: { ...state.settings, apiKey: '' } };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `speakup-daily-backup-${todayStr()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const importData = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      if (!parsed || typeof parsed !== 'object' || !('profile' in parsed || 'entries' in parsed || 'phrases' in parsed)) throw new Error('This does not look like a SpeakUp Daily backup.');
      if (!confirm('Replace ALL current data with this backup?')) return;
      const next = normalizeState(parsed);
      if (!next.settings.apiKey) next.settings.apiKey = state.settings.apiKey; // keep current key if backup has none
      next.settings.onboarded = true;
      replaceAll(next);
      setImportMsg(`Imported ✓ (${next.entries.length} answers, ${next.phrases.length} phrases)`);
    } catch (e) {
      setImportMsg(`Import failed: ${errorText(e)}`);
    }
  };

  const reset = () => {
    if (confirm('Delete ALL your SpeakUp Daily data from this browser? Export a backup first if you want to keep it.') && confirm('Are you sure? This cannot be undone.')) {
      replaceAll(defaultState());
    }
  };

  return (
    <div className="space-y-4">
      <PageTitle title="Settings" />

      <section className="card space-y-3">
        <div>
          <h2 className="h-section">🔑 Gemini AI</h2>
          <p className="muted">Get a free key at <a className="text-blue-600 underline dark:text-blue-300" href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>. It's stored only in this browser and sent only to Google. Use <code>demo</code> to try sample answers.</p>
        </div>
        <div>
          <label className="label">API key</label>
          <div className="flex gap-2">
            <input className="input font-mono" type={show ? 'text' : 'password'} value={key} onChange={(e) => { setKey(e.target.value); setMsg(null); }} placeholder="AIza…" autoComplete="off" />
            <button className="btn-ghost shrink-0 !px-3" onClick={() => setShow((v) => !v)} title={show ? 'Hide' : 'Show'}><Icon name="eye" className="h-4 w-4" /></button>
          </div>
          {isDemoKey(key) && key && <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">Demo mode: AI answers are sample data, not real feedback.</p>}
        </div>
        <div>
          <label className="label">Model</label>
          <input className="input font-mono" list="models" value={model} onChange={(e) => setModel(e.target.value)} />
          <datalist id="models">{MODELS.map((m) => <option key={m} value={m} />)}</datalist>
          <p className="mt-1 text-xs text-slate-500">Default: gemini-flash-lite-latest (fast). If a model is unavailable or slow, the app switches automatically.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-blue-600" checked={s.fastMode} onChange={(e) => set({ fastMode: e.target.checked })} />
          Fast mode (turn off "thinking" on 2.5 Flash models for quicker replies)
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-primary" onClick={saveAI}>Save</button>
          <button className="btn-soft" onClick={check} disabled={!key.trim() || testing}>{testing ? <Spinner /> : <Icon name="check" className="h-4 w-4" />} Test connection</button>
          {msg && <span className={`text-sm ${msg.ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}`}>{msg.text}</span>}
        </div>
      </section>

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
            <button className="btn-soft w-fit" onClick={() => speak("Hi! The thing is, practice makes progress, not perfect.", { voiceURI: s.voiceURI, rate: s.rate })}><Icon name="play" className="h-4 w-4" /> Test voice</button>
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
          <p className="muted">All your data lives only in this browser. Export a backup now and then, or to move to another device.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="accent-blue-600" checked={includeKey} onChange={(e) => setIncludeKey(e.target.checked)} /> Include my API key in the backup file
        </label>
        <div className="flex flex-wrap gap-2">
          <button className="btn-soft" onClick={exportData}><Icon name="download" className="h-4 w-4" /> Export JSON</button>
          <button className="btn-soft" onClick={() => fileRef.current?.click()}><Icon name="upload" className="h-4 w-4" /> Import JSON</button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importData(f); e.target.value = ''; }} />
        </div>
        {importMsg && <p className="text-sm">{importMsg}</p>}
      </section>

      <section className="card space-y-3">
        <h2 className="h-section">⚠️ Danger zone</h2>
        <div className="flex flex-wrap gap-2">
          <button className="btn-ghost" onClick={() => set({ onboarded: false })}>Show welcome screen again</button>
          <button className="btn-danger" onClick={reset}><Icon name="trash" className="h-4 w-4" /> Delete all data</button>
        </div>
      </section>
      <p className="pb-4 text-center text-xs text-slate-400">SpeakUp Daily · free, private, runs in your browser</p>
    </div>
  );
}
