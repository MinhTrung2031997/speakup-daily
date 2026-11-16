import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';
import ProfileForm from '../components/ProfileForm';
import TopicsEditor from '../components/TopicsEditor';
import { PageTitle } from '../components/ui';

export default function Profile() {
  const { state, update } = useStore();
  const [profile, setProfile] = useState(state.profile);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (saved) { const t = setTimeout(() => setSaved(false), 2000); return () => clearTimeout(t); } }, [saved]);

  const dirty = JSON.stringify(profile) !== JSON.stringify(state.profile);
  return (
    <div className="space-y-4">
      <PageTitle title="Profile & topics" subtitle="The AI uses this to make questions and answers fit your real life." />
      <section className="card space-y-4">
        <h2 className="h-section">🙋 About me</h2>
        <ProfileForm value={profile} onChange={setProfile} />
        <div className="flex items-center gap-3">
          <button className="btn-primary" disabled={!dirty} onClick={() => { update((s) => ({ ...s, profile })); setSaved(true); }}>Save profile</button>
          {saved && <span className="text-sm text-emerald-600 dark:text-emerald-300">Saved ✓</span>}
        </div>
      </section>
      <section className="card space-y-3">
        <div>
          <h2 className="h-section">🧭 Topics</h2>
          <p className="muted">Tap to turn topics on or off. Changes save automatically.</p>
        </div>
        <TopicsEditor topics={state.topics} onChange={(topics) => update((s) => ({ ...s, topics }))} />
      </section>
    </div>
  );
}
