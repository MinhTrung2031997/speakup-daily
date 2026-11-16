import { useState } from 'react';
import type { Entry, PhraseItem } from '../lib/types';
import { cleanPhrase } from '../lib/diff';
import { useStore } from '../lib/store';
import ListenPlayer from './ListenPlayer';
import Icon from './Icon';

const COLORS = [
  'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200',
  'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200',
  'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200',
  'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200',
];

/** The Answer builder's model answer: Listen player, labelled parts, the learner's picks and savable phrases. */
export default function BuilderResult({ entry, hidden = false, onSave, step }: { entry: Entry; hidden?: boolean; onSave?: (items: PhraseItem[]) => number; step?: number }) {
  const { state } = useStore();
  const [msg, setMsg] = useState('');
  const up = entry.upgrade;
  const b = entry.builder;
  if (!up || !b) return null;
  const inBank = new Set(state.phrases.map((p) => cleanPhrase(p.phrase).toLowerCase()));
  const saved = (p: PhraseItem) => inBank.has(cleanPhrase(p.phrase).toLowerCase());
  const unsaved = up.phrases.filter((p) => !saved(p));
  const save = (items: PhraseItem[]) => {
    if (!onSave) return;
    const n = onSave(items);
    setMsg(n ? `Saved ${n} phrase${n > 1 ? 's' : ''} to your Phrase Bank.` : 'Already in your Phrase Bank.');
  };

  return (
    <div className="space-y-4">
      <section className="card">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="h-section flex items-center gap-2">
            {step && <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white dark:bg-blue-500 dark:text-slate-950">{step}</span>}
            🎧 Your model answer
          </h2>
          <span className="muted text-xs">{b.level} · ~{b.seconds}s · {b.qtype}</span>
        </div>
        {hidden ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">🙈 Hidden while you practise. No peeking!</div>
        ) : (
          <>
            <ListenPlayer text={up.natural} phrases={up.phrases.map((p) => p.phrase)} />
            <div className="mt-4 space-y-2">
              {b.parts.map((p, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span className={`chip h-fit shrink-0 ${COLORS[Math.max(0, b.slots.indexOf(p.slot)) % COLORS.length]}`}>{p.slot || b.slots[i] || `Part ${i + 1}`}</span>
                  <span className="text-slate-600 dark:text-slate-300">{p.text}</span>
                </div>
              ))}
            </div>
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-xs font-medium text-slate-500">Your picks</summary>
              <ul className="mt-2 space-y-1">
                {b.slots.map((s) => <li key={s} className="text-slate-600 dark:text-slate-300"><b>{s}:</b> {b.picks[s]}</li>)}
              </ul>
            </details>
          </>
        )}
      </section>

      {!hidden && up.phrases.length > 0 && (
        <section className="card">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="h-section">✨ Phrases to steal</h2>
              <p className="muted">Tap to save them to your Phrase Bank.</p>
            </div>
            {onSave && unsaved.length > 1 && <button className="btn-soft !py-1.5" onClick={() => save(unsaved)}><Icon name="plus" className="h-4 w-4" /> Save all</button>}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {up.phrases.map((p) => (
              <div key={p.phrase} className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
                <div className="flex-1">
                  <p className="font-semibold text-amber-900 dark:text-amber-200">"{p.phrase}"</p>
                  <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{p.meaning}</p>
                  {p.example && <p className="mt-1 text-sm italic text-slate-500 dark:text-slate-400">e.g. {p.example}</p>}
                </div>
                {onSave && (saved(p) ? (
                  <span className="chip h-fit bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"><Icon name="check" className="h-3.5 w-3.5" /> Saved</span>
                ) : (
                  <button className="btn-soft h-fit !px-2.5 !py-1.5 text-xs" onClick={() => save([p])} title="Save to Phrase Bank"><Icon name="plus" className="h-3.5 w-3.5" /> Save</button>
                ))}
              </div>
            ))}
          </div>
          {msg && <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-300">✅ {msg}</p>}
        </section>
      )}
    </div>
  );
}
