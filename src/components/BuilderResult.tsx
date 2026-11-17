import { useState, type ReactNode } from 'react';
import type { BuilderInfo, PhraseItem } from '../lib/types';
import { cleanPhrase } from '../lib/diff';
import { lengthText } from '../lib/ai';
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

/** Anything with a model answer + builder info (a builder Entry, or a daily question's suggested answer). */
export interface BuilderView {
  upgrade?: { natural: string; phrases: PhraseItem[] };
  builder?: BuilderInfo;
}

/** A model answer: Listen player, labelled parts with the idea used for each, and savable phrases. */
export default function BuilderResult({ entry, hidden = false, onSave, step, title = '🎧 Your model answer', controls, onIdea, busy = false }: {
  entry: BuilderView;
  hidden?: boolean;
  onSave?: (items: PhraseItem[]) => number;
  step?: number;
  title?: string;
  /** Extra controls under the header (e.g. the level / length switcher). */
  controls?: ReactNode;
  /** Tap an idea label to swap it (chips load lazily). */
  onIdea?: (slot: string) => void;
  /** Regenerating: dim the old answer. */
  busy?: boolean;
}) {
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
            {title}
          </h2>
          <span className="muted text-xs">{b.level} · {lengthText(b.seconds)} · {b.qtype}</span>
        </div>
        {controls}
        {hidden ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">🙈 Hidden while you practise. No peeking!</div>
        ) : (
          <div className={busy ? 'pointer-events-none opacity-50 transition' : 'transition'}>
            <ListenPlayer text={up.natural} phrases={up.phrases.map((p) => p.phrase)} />
            <div className="mt-4 space-y-2">
              {b.parts.map((p, i) => {
                const slot = p.slot || b.slots[i] || `Part ${i + 1}`;
                const idea = (b.picks[slot] || '').trim();
                return (
                  <div key={i} className="flex gap-2 text-sm" data-part={slot}>
                    <span className={`chip h-fit shrink-0 ${COLORS[Math.max(0, b.slots.indexOf(p.slot)) % COLORS.length]}`}>{slot}</span>
                    <div className="min-w-0">
                      {idea && (onIdea ? (
                        <button className="idea-label mb-0.5 inline-flex max-w-full items-center gap-1 rounded-md px-1 text-left text-[11px] leading-snug text-slate-500 underline decoration-dotted underline-offset-2 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800" onClick={() => onIdea(slot)} title="Swap this idea">
                          💡 {idea} <Icon name="refresh" className="h-3 w-3 shrink-0" />
                        </button>
                      ) : (
                        <p className="idea-label mb-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">💡 {idea}</p>
                      ))}
                      <p className="text-slate-600 dark:text-slate-300">{p.text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
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
