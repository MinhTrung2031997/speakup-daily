import { useState } from 'react';
import { useStore } from '../lib/store';
import ProfileForm from '../components/ProfileForm';
import TopicsEditor from '../components/TopicsEditor';
import ImportBanner from '../components/ImportBanner';

export default function Welcome() {
  const { state, update } = useStore();
  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState(state.profile);
  const [topics, setTopics] = useState(state.topics);

  const finish = () =>
    update((s) => ({ ...s, profile, topics, settings: { ...s.settings, onboarded: true } }));

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white px-4 py-8 dark:from-slate-900 dark:to-slate-950">
      <div className="mx-auto max-w-xl">
        <div className="mb-6 flex items-center gap-3">
          <img src="/favicon.svg" alt="" className="h-11 w-11" />
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">SpeakUp <span className="text-blue-600 dark:text-blue-400">Daily</span></h1>
            <p className="muted">Turn the words you know into things you can actually say.</p>
          </div>
        </div>

        <ImportBanner />
        <div className="mb-4 flex gap-1.5">
          {[1, 2].map((i) => <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-blue-600 dark:bg-blue-400' : 'bg-slate-200 dark:bg-slate-800'}`} />)}
        </div>

        {step === 1 && (
          <div className="card space-y-4">
            <div>
              <h2 className="text-lg font-semibold">🙋 Tell me about you</h2>
              <p className="muted mt-1">Welcome! Questions and model answers will use your real life, so they're easier to say and remember.</p>
            </div>
            <ProfileForm value={profile} onChange={setProfile} />
            <div className="flex justify-between gap-2">
              <span />
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
            <TopicsEditor topics={topics} onChange={setTopics} showFavorites={false} />
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
