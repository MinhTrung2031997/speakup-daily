import { useState } from 'react';
import type { Topic } from '../lib/types';
import { uid } from '../lib/date';
import Icon from './Icon';

export default function TopicsEditor({ topics, onChange }: { topics: Topic[]; onChange: (t: Topic[]) => void }) {
  const [name, setName] = useState('');
  const toggle = (id: string) => onChange(topics.map((t) => (t.id === id ? { ...t, active: !t.active } : t)));
  const remove = (id: string) => onChange(topics.filter((t) => t.id !== id));
  const add = () => {
    const n = name.trim();
    if (!n || topics.some((t) => t.name.toLowerCase() === n.toLowerCase())) return;
    onChange([...topics, { id: uid(), name: n, emoji: '⭐', active: true, custom: true }]);
    setName('');
  };
  const activeCount = topics.filter((t) => t.active).length;
  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {topics.map((t) => (
          <span key={t.id} className={`inline-flex items-center rounded-full border text-sm font-medium transition ${t.active ? 'border-blue-500 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500 dark:text-slate-950' : 'border-slate-300 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}>
            <button type="button" onClick={() => toggle(t.id)} className="flex items-center gap-1.5 py-1.5 pl-3 pr-3">
              <span>{t.emoji}</span> {t.name} {t.active && <Icon name="check" className="h-3.5 w-3.5" />}
            </button>
            {t.custom && (
              <button type="button" onClick={() => remove(t.id)} className="-ml-1 mr-1.5 rounded-full p-0.5 opacity-70 hover:opacity-100" aria-label={`Remove ${t.name}`}>
                <Icon name="x" className="h-3.5 w-3.5" />
              </button>
            )}
          </span>
        ))}
      </div>
      {activeCount === 0 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Pick at least one topic (otherwise all topics are used).</p>}
      <div className="mt-3 flex gap-2">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), add())} placeholder="Add a custom topic, e.g. Football, Startups, Anime" />
        <button type="button" className="btn-soft shrink-0" onClick={add}><Icon name="plus" className="h-4 w-4" /> Add</button>
      </div>
    </div>
  );
}
