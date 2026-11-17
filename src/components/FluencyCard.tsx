import type { FluencyStats } from '../lib/types';

function Metric({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone: 'good' | 'ok' | 'warn' }) {
  const color = tone === 'good' ? 'text-emerald-600 dark:text-emerald-300' : tone === 'ok' ? 'text-blue-600 dark:text-blue-300' : 'text-amber-600 dark:text-amber-300';
  return (
    <div className="rounded-xl bg-white p-2.5 dark:bg-slate-900">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
      {sub && <p className="truncate text-[11px] text-slate-400" title={sub}>{sub}</p>}
    </div>
  );
}

/** Pace, fillers, restarts and long pauses for one spoken answer, plus one tip. */
export default function FluencyCard({ stats, title = '📈 Fluency' }: { stats: FluencyStats; title?: string }) {
  const per100 = stats.words ? (stats.fillers / stats.words) * 100 : 0;
  const fillers = Object.entries(stats.fillerWords).sort((a, b) => b[1] - a[1]);
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50" data-testid="fluency">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">{title}</p>
        <span className="text-xs text-slate-500">{stats.source === 'audio' && <span className="mr-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200" title="Fillers and pauses counted from your recording">🎧 from audio</span>}{stats.words} words · {stats.seconds}s</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Pace" value={`${stats.wpm}`} sub="words / min" tone={stats.wpm >= 100 && stats.wpm <= 165 ? 'good' : stats.wpm >= 80 && stats.wpm <= 185 ? 'ok' : 'warn'} />
        <Metric label="Fillers" value={stats.fillers} sub={fillers.length ? fillers.map(([w, n]) => `${w} ×${n}`).join(', ') : 'none 🎉'} tone={per100 < 2 ? 'good' : per100 < 6 ? 'ok' : 'warn'} />
        <Metric label="Restarts" value={stats.restarts} sub={stats.restartExamples.length ? stats.restartExamples.map((r) => `“${r} ${r}”`).join(', ') : 'none 🎉'} tone={stats.restarts === 0 ? 'good' : stats.restarts < 3 ? 'ok' : 'warn'} />
        <Metric label="Long pauses" value={stats.pauses} sub={stats.pauses ? `longest ${stats.longestPause}s` : `over ${stats.source === 'audio' ? '1.5' : '2'}s: none`} tone={stats.pauses === 0 ? 'good' : stats.pauses < 3 ? 'ok' : 'warn'} />
      </div>
      {stats.tip && <p className="mt-2 rounded-lg bg-blue-50 p-2.5 text-sm text-blue-900 dark:bg-blue-950/50 dark:text-blue-100">💡 <b>Tip:</b> {stats.tip}</p>}
    </div>
  );
}
