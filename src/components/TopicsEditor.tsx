import { useState } from 'react';
import type { Topic } from '../lib/types';
import { uid } from '../lib/date';
import Icon from './Icon';
import { groupTopics } from '../lib/topics';

export default function TopicsEditor({ topics, onChange, showFavorites = true }: { topics: Topic[]; onChange: (t: Topic[]) => void; showFavorites?: boolean }) {
  const [name, setName] = useState('');
  const toggle = (id: string) => onChange(topics.map((t) => (t.id === id ? { ...t, active: !t.active } : t)));
  const fav = (id: string) => onChange(topics.map((t) => (t.id === id ? { ...t, favorite: !t.favorite } : t)));
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
      <div className="space-y-3" data-testid="topics-editor">
        {groupTopics(topics).map((g) => (
          <div key={g.group}>
            <p className="mb-1.5 text-xs font-semibold text-slate-500">{g.group}</p>
            <div className="flex flex-wrap gap-2">
              {g.topics.map((t) => (
                <span key={t.id} data-topic={t.id} className={`inline-flex items-center rounded-full border text-sm font-medium transition ${t.active ? 'border-blue-500 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500 dark:text-slate-950' : 'border-slate-300 bg-white text-slate-500 line-through decoration-slate-400/60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'}`}>
                  <button type="button" onClick={() => toggle(t.id)} className="flex items-center gap-1.5 py-1.5 pl-3 pr-1.5" title={t.active ? 'On: tap to turn off' : 'Off: tap to turn on'} aria-pressed={t.active}>
                    <span>{t.emoji}</span> {t.name}
                  </button>
                  {showFavorites && t.active && (
                    <button type="button" onClick={() => fav(t.id)} className={`mr-1 rounded-full px-1 text-base leading-none ${t.favorite ? '' : 'opacity-40 grayscale hover:opacity-80'}`} title={t.favorite ? 'Favourite (asked more often)' : 'Make favourite'} aria-pressed={!!t.favorite} data-testid="topic-fav">⭐</button>
                  )}
                  {t.custom && (
                    <button type="button" onClick={() => remove(t.id)} className="mr-1.5 rounded-full p-0.5 opacity-70 hover:opacity-100" aria-label={`Remove ${t.name}`}>
                      <Icon name="x" className="h-3.5 w-3.5" />
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
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
