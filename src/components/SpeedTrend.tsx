import BarChart from './BarChart';
import { HARD_LIMIT } from '../lib/speed';
import type { QuickFireRound } from '../lib/types';

/** Average start time per round (last 12), lower is better, plus the fillers-per-minute line underneath. */
export function SpeedTrend({ rounds }: { rounds: QuickFireRound[] }) {
  const list = rounds.filter((r) => r.avgStart != null).slice(-12);
  if (!list.length) return <p className="muted text-sm">No rounds yet.</p>;
  const data = list.map((r) => ({ label: r.date.slice(5), value: r.avgStart || 0, title: `${r.date}: start ${r.avgStart?.toFixed(1)} s, ${r.fillersPerMin?.toFixed(1) ?? '–'} fillers/min` }));
  const first = list[0];
  const last = list[list.length - 1];
  const d = list.length > 1 && first.avgStart != null && last.avgStart != null ? Math.round((last.avgStart - first.avgStart) * 10) / 10 : null;
  return (
    <div data-testid="speed-trend">
      <BarChart data={data} color="fill-amber-500" unit=" s" />
      <p className="mt-1 text-xs text-slate-500">
        Seconds to first word per round (lower is faster). Goal: under {HARD_LIMIT} s.
        {d != null && <> {d < 0 ? `▼ ${Math.abs(d)} s faster` : d > 0 ? `▲ ${d} s slower` : 'Same'} than {list.length} rounds ago.</>}
        {last.fillersPerMin != null && <> Last round: {last.fillersPerMin.toFixed(1)} fillers/min.</>}
      </p>
    </div>
  );
}
