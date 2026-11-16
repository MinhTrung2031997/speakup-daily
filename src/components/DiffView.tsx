import { wordDiff } from '../lib/diff';

export default function DiffView({ before, after }: { before: string; after: string }) {
  const { left, right } = wordDiff(before, after);
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">What I said</p>
        <p className="text-[15px] leading-7">
          {left.map((p, i) => (
            <span key={i} className={p.type === 'removed' ? 'rounded bg-rose-100 text-rose-700 line-through decoration-rose-400 dark:bg-rose-900/40 dark:text-rose-200' : ''}>{p.text}{' '}</span>
          ))}
        </p>
      </div>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 dark:border-emerald-900 dark:bg-emerald-950/30">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">More natural version</p>
        <p className="text-[15px] leading-7">
          {right.map((p, i) => (
            <span key={i} className={p.type === 'added' ? 'rounded bg-emerald-100 font-medium text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200' : ''}>{p.text}{' '}</span>
          ))}
        </p>
      </div>
    </div>
  );
}
