import type { Entry } from '../lib/types';
import DiffView from './DiffView';
import ListenPlayer from './ListenPlayer';

const PARTS: { key: 'point' | 'reason' | 'example' | 'wrapUp'; label: string; color: string }[] = [
  { key: 'point', label: 'Point', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/60 dark:text-blue-200' },
  { key: 'reason', label: 'Reason', color: 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200' },
  { key: 'example', label: 'Example', color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200' },
  { key: 'wrapUp', label: 'Wrap-up', color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200' },
];

export default function UpgradeResult({ entry, hideModel = false }: { entry: Entry; hideModel?: boolean }) {
  const up = entry.upgrade;
  if (!up) return null;
  const phraseTexts = up.phrases.map((p) => p.phrase);
  return (
    <div className="space-y-4">
      {up.encouragement && (
        <div className="rounded-2xl bg-gradient-to-r from-blue-600 to-sky-500 p-4 text-white shadow-sm dark:from-blue-700 dark:to-sky-700">
          <p className="text-sm font-medium">🌟 {up.encouragement}</p>
        </div>
      )}

      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="h-section">🎧 Your upgraded answer</h2>
          <span className="muted text-xs">Point → Reason → Example → Wrap-up</span>
        </div>
        {hideModel ? (
          <div className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500 dark:border-slate-700">🙈 Hidden while you practise. No peeking!</div>
        ) : (
          <>
            <ListenPlayer text={up.natural} phrases={phraseTexts} />
            {(up.structure.point || up.structure.reason) && (
              <div className="mt-4 space-y-2">
                {PARTS.filter((p) => up.structure[p.key]).map((p) => (
                  <div key={p.key} className="flex gap-2 text-sm">
                    <span className={`chip h-fit shrink-0 ${p.color}`}>{p.label}</span>
                    <span className="text-slate-600 dark:text-slate-300">{up.structure[p.key]}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      {!hideModel && (
        <section className="card">
          <h2 className="h-section mb-3">🔍 What I said vs. more natural</h2>
          <DiffView before={entry.answer} after={up.natural} />
        </section>
      )}

      {!hideModel && up.phrases.length > 0 && (
        <section className="card">
          <h2 className="h-section mb-1">✨ Phrases to steal</h2>
          <p className="muted mb-3">Saved to your Phrase Bank automatically.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {up.phrases.map((p) => (
              <div key={p.phrase} className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/60 dark:bg-amber-950/20">
                <p className="font-semibold text-amber-900 dark:text-amber-200">"{p.phrase}"</p>
                <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-300">{p.meaning}</p>
                {p.example && <p className="mt-1 text-sm italic text-slate-500 dark:text-slate-400">e.g. {p.example}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {!hideModel && up.corrections.length > 0 && (
        <section className="card">
          <h2 className="h-section mb-3">🩹 Small fixes</h2>
          <ul className="space-y-3">
            {up.corrections.map((c, i) => (
              <li key={i} className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  {c.original && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700 line-through dark:bg-rose-950/40 dark:text-rose-300">{c.original}</span>}
                  <span className="text-slate-400">→</span>
                  <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">{c.better}</span>
                </div>
                {c.why && <p className="mt-1 text-slate-500 dark:text-slate-400">{c.why}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
