import type { Entry } from '../lib/types';
import FluencyCard from './FluencyCard';

/** Score card for a "say it again" attempt: score ring, phrases used/missed, fluency and a tip. */
export default function RetryCard({ entry }: { entry: Entry }) {
  const r = entry.retry!;
  const total = r.used.length + r.missed.length || 1;
  const color = r.score >= 80 ? 'text-emerald-600 dark:text-emerald-300' : r.score >= 60 ? 'text-blue-600 dark:text-blue-300' : 'text-amber-600 dark:text-amber-300';
  return (
    <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
      <div className="flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <svg viewBox="0 0 36 36" className="h-16 w-16 -rotate-90">
            <circle cx="18" cy="18" r="15.9" fill="none" className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="3.5" />
            <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" className={color} strokeWidth="3.5" strokeDasharray={`${r.score} 100`} strokeLinecap="round" />
          </svg>
          <span className={`absolute inset-0 flex items-center justify-center text-lg font-bold ${color}`}>{r.score}</span>
        </div>
        <div className="text-sm">
          <p className="font-semibold">{r.used.length}/{total} target phrases used</p>
          {r.praise && <p className="text-slate-600 dark:text-slate-300">{r.praise}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {r.used.map((p) => <span key={p} className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">✓ {p}</span>)}
        {r.missed.map((p) => <span key={p} className="chip bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">○ {p}</span>)}
      </div>
      {r.fluency && <div className="mt-3"><FluencyCard stats={r.fluency} title="📈 Fluency (this try)" /></div>}
      {r.tip && <p className="mt-3 rounded-lg bg-blue-50 p-2.5 text-sm text-blue-900 dark:bg-blue-950/50 dark:text-blue-100">💡 <b>Tip:</b> {r.tip}</p>}
    </div>
  );
}
