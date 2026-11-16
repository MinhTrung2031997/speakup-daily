import { useState } from 'react';
import type { PhraseItem } from '../lib/types';
import { cleanPhrase } from '../lib/diff';
import { useStore } from '../lib/store';
import Icon from './Icon';

/** Phrase cards with one-tap "Save" to the Phrase Bank (plus "Save all"). */
export default function PhraseCards({ phrases, source, title = '✨ Phrases to steal' }: { phrases: PhraseItem[]; source: string; title?: string }) {
  const { state, addPhrases } = useStore();
  const [msg, setMsg] = useState('');
  if (!phrases.length) return null;
  const inBank = new Set(state.phrases.map((p) => cleanPhrase(p.phrase).toLowerCase()));
  const saved = (p: PhraseItem) => inBank.has(cleanPhrase(p.phrase).toLowerCase());
  const unsaved = phrases.filter((p) => !saved(p));
  const save = (items: PhraseItem[]) => {
    const n = addPhrases(items, source);
    setMsg(n ? `Saved ${n} phrase${n > 1 ? 's' : ''} to your Phrase Bank.` : 'Already in your Phrase Bank.');
  };
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="h-section">{title}</h3>
          <p className="muted">Tap to save them to your Phrase Bank.</p>
        </div>
        {unsaved.length > 1 && <button className="btn-soft !py-1.5" onClick={() => save(unsaved)}><Icon name="plus" className="h-4 w-4" /> Save all</button>}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {phrases.map((p) => (
          <div key={p.phrase} className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
            <div className="flex-1">
              <p className="font-semibold text-amber-900 dark:text-amber-200">"{p.phrase}"</p>
              <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{p.meaning}</p>
              {p.example && <p className="mt-1 text-sm italic text-slate-500 dark:text-slate-400">e.g. {p.example}</p>}
            </div>
            {saved(p) ? (
              <span className="chip h-fit bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"><Icon name="check" className="h-3.5 w-3.5" /> Saved</span>
            ) : (
              <button className="btn-soft h-fit !px-2.5 !py-1.5 text-xs" onClick={() => save([p])} title="Save to Phrase Bank"><Icon name="plus" className="h-3.5 w-3.5" /> Save</button>
            )}
          </div>
        ))}
      </div>
      {msg && <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-300">✅ {msg}</p>}
    </div>
  );
}
