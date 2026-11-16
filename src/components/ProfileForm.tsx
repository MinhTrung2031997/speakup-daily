import type { Profile } from '../lib/types';

const LEVELS = ['A2 (elementary)', 'B1 (intermediate)', 'B1–B2 (intermediate)', 'B2 (upper-intermediate)', 'C1 (advanced)'];

export default function ProfileForm({ value, onChange }: { value: Profile; onChange: (p: Profile) => void }) {
  const set = (k: keyof Profile) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <label className="label">Name</label>
        <input className="input" value={value.name} onChange={set('name')} placeholder="Trung" />
      </div>
      <div>
        <label className="label">Job</label>
        <input className="input" value={value.job} onChange={set('job')} placeholder="e.g. software developer" />
      </div>
      <div>
        <label className="label">City</label>
        <input className="input" value={value.city} onChange={set('city')} placeholder="e.g. Ho Chi Minh City" />
      </div>
      <div>
        <label className="label">English level</label>
        <select className="input" value={value.level} onChange={set('level')}>
          {LEVELS.map((l) => <option key={l}>{l}</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">Hobbies</label>
        <input className="input" value={value.hobbies} onChange={set('hobbies')} placeholder="e.g. gaming, coffee, football, anime" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Goals</label>
        <input className="input" value={value.goals} onChange={set('goals')} placeholder="e.g. speak confidently on Discord and in meetings" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">Facts about me</label>
        <textarea className="input" rows={3} value={value.facts} onChange={set('facts')} placeholder="Anything that makes answers sound like your real life: family, pets, favourite food, places you've been…" />
        <p className="mt-1 text-xs text-slate-500">This is sent to the AI so questions and model answers fit your life.</p>
      </div>
    </div>
  );
}
