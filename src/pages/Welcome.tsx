import { useState } from 'react';
import { useStore } from '../lib/store';
import ProfileForm from '../components/ProfileForm';
import TopicsEditor from '../components/TopicsEditor';
import { testKey } from '../lib/ai';
import { errorText } from '../lib/gemini';
import { Spinner } from '../components/ui';
import Icon from '../components/Icon';

export default function Welcome() {
  const { state, update } = useStore();
  const [step, setStep] = useState(0);
  const [key, setKey] = useState(state.settings.apiKey);
  const [profile, setProfile] = useState(state.profile);
  const [topics, setTopics] = useState(state.topics);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const check = async () => {
    setTesting(true);
    setMsg(null);
    try {
      const m = await testKey({ apiKey: key, model: state.settings.model, fastMode: state.settings.fastMode });
      setMsg({ ok: true, text: `It works! "${m}"` });
    } catch (e) {
      setMsg({ ok: false, text: errorText(e) });
    } finally {
      setTesting(false);
    }
  };

  const finish = () =>
    update((s) => ({ ...s, profile, topics, settings: { ...s.settings, apiKey: key.trim(), onboarded: true } }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white px-4 py-8 dark:from-slate-900 dark:to-slate-950">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex items-center gap-3">
          <img src="./favicon.svg" alt="" className="h-11 w-11" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">SpeakUp <span className="text-blue-600 dark:text-blue-400">Daily</span></h1>
            <p className="muted">Turn the words you know into things you can actually say.</p>
          </div>
        </div>

        <div className="mb-4 flex gap-1.5">
          {[0, 1, 2].map((i) => <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-blue-600 dark:bg-blue-400' : 'bg-slate-200 dark:bg-slate-800'}`} />)}
        </div>

        {step === 0 && (
          <div className="card space-y-4">
            <div>
              <h2 className="text-lg font-semibold">👋 Welcome! First, a free AI key</h2>
              <p className="muted mt-1">SpeakUp Daily uses Google's Gemini AI to write your daily question and upgrade your answers. It's free for personal use. Your key is saved only in this browser and sent only to Google.</p>
            </div>
            <ol className="space-y-2 text-sm">
              <li className="flex gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-200">1</span><span>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer" className="font-medium text-blue-600 underline dark:text-blue-300">aistudio.google.com/apikey</a> and sign in with your Google account.</span></li>
              <li className="flex gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-200">2</span><span>Click <b>Create API key</b> (accept the terms if asked).</span></li>
              <li className="flex gap-2"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700 dark:bg-blue-900 dark:text-blue-200">3</span><span>Copy the key (it starts with <code>AIza…</code>) and paste it below.</span></li>
            </ol>
            <div>
              <label className="label">Gemini API key</label>
              <div className="flex gap-2">
                <input className="input font-mono" type="password" value={key} onChange={(e) => { setKey(e.target.value); setMsg(null); }} placeholder="AIza…" autoComplete="off" />
                <button className="btn-soft shrink-0" onClick={check} disabled={!key.trim() || testing}>{testing ? <Spinner /> : <Icon name="check" className="h-4 w-4" />} Test</button>
              </div>
              {msg && <p className={`mt-2 text-sm ${msg.ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}`}>{msg.text}</p>}
              <p className="mt-2 text-xs text-slate-500">Just looking around? Type <button className="font-mono text-blue-600 underline dark:text-blue-300" onClick={() => setKey('demo')}>demo</button> to try it with sample AI answers. You can change this later in Settings.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setStep(1)}>Skip for now</button>
              <button className="btn-primary" onClick={() => setStep(1)}>Next</button>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="card space-y-4">
            <div>
              <h2 className="text-lg font-semibold">🙋 Tell me about you</h2>
              <p className="muted mt-1">Questions and model answers will use your real life, so they're easier to say and remember.</p>
            </div>
            <ProfileForm value={profile} onChange={setProfile} />
            <div className="flex justify-between gap-2">
              <button className="btn-ghost" onClick={() => setStep(0)}>Back</button>
              <button className="btn-primary" onClick={() => setStep(2)}>Next</button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="card space-y-4">
            <div>
              <h2 className="text-lg font-semibold">🧭 Pick your topics</h2>
              <p className="muted mt-1">Your daily question will come from the topics you turn on.</p>
            </div>
            <TopicsEditor topics={topics} onChange={setTopics} />
            <div className="flex justify-between gap-2">
              <button className="btn-ghost" onClick={() => setStep(1)}>Back</button>
              <button className="btn-primary" onClick={finish}>Start speaking 🚀</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
