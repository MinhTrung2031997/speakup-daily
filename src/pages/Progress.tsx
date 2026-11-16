import { useStore } from '../lib/store';
import { addDays, lastNDays, todayStr } from '../lib/date';
import { activeDates, phraseStats, streak } from '../lib/stats';
import { MASTERED_STAGE } from '../lib/srs';
import BarChart from '../components/BarChart';
import { PageTitle } from '../components/ui';

function Stat({ icon, label, value, sub }: { icon: string; label: string; value: string | number; sub?: string }) {
  return (
    <div className="card !p-4">
      <p className="text-xs font-medium text-slate-500">{icon} {label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">{value}</p>
      {sub && <p className="text-xs text-slate-400">{sub}</p>}
    </div>
  );
}

export default function Progress() {
  const { state } = useStore();
  const st = streak(state);
  const ps = phraseStats(state);
  const totalSec = Object.values(state.speakingLog).reduce((a, b) => a + b, 0);
  const days = lastNDays(14);
  const short = (d: string) => String(Number(d.slice(8)));
  const answersData = days.map((d) => ({ label: short(d), value: state.entries.filter((e) => e.date === d).length }));
  const minutesData = days.map((d) => ({ label: short(d), value: Math.round(((state.speakingLog[d] || 0) / 60) * 10) / 10 }));
  const userMsgs = state.chats.reduce((n, c) => n + c.messages.filter((m) => m.role === 'user').length, 0);

  const stages = Array.from({ length: MASTERED_STAGE + 1 }, (_, i) => state.phrases.filter((p) => Math.min(p.stage, MASTERED_STAGE) === i).length);
  const stageNames = ['New', 'Day 1 ✓', 'Day 3 ✓', 'Day 7 ✓', 'Day 14 ✓', 'Mastered'];
  const maxStage = Math.max(1, ...stages);

  // 12-week activity calendar
  const active = activeDates(state);
  const today = todayStr();
  const dow = (new Date().getDay() + 6) % 7; // Monday = 0
  const start = addDays(today, -(7 * 11 + dow));
  const weeks = Array.from({ length: 12 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)));

  const fmtMin = (s: number) => (s < 60 ? `${Math.round(s)}s` : `${Math.round(s / 60)} min`);

  return (
    <div className="space-y-4">
      <PageTitle title="Progress" subtitle={st.practicedToday ? "You've practised today. Nice! 🎉" : 'Practise today to keep your streak going.'} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat icon="🔥" label="Day streak" value={st.current} sub={`Best: ${st.best}`} />
        <Stat icon="🎙️" label="Answers" value={state.entries.length} sub={`${userMsgs} chat messages`} />
        <Stat icon="⏱️" label="Time spoken" value={fmtMin(totalSec)} sub="using the mic" />
        <Stat icon="🏆" label="Phrases learned" value={ps.learned} sub={`${ps.mastered} mastered · ${ps.total} saved`} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="h-section">Answers per day</h2>
          <p className="muted mb-2 text-xs">Last 14 days</p>
          <BarChart data={answersData} />
        </div>
        <div className="card">
          <h2 className="h-section">Minutes spoken</h2>
          <p className="muted mb-2 text-xs">Last 14 days</p>
          <BarChart data={minutesData} color="fill-emerald-500" unit=" min" />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h2 className="h-section mb-3">Phrase journey</h2>
          <div className="space-y-2">
            {stages.map((n, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="w-20 shrink-0 text-xs text-slate-500">{stageNames[i]}</span>
                <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className={`h-full rounded-full ${i === MASTERED_STAGE ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${(n / maxStage) * 100}%`, opacity: 0.45 + (i / MASTERED_STAGE) * 0.55 }} />
                </div>
                <span className="w-6 text-right text-xs font-semibold">{n}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <h2 className="h-section mb-3">Practice calendar</h2>
          <div className="flex gap-1">
            {weeks.map((w, i) => (
              <div key={i} className="flex flex-1 flex-col gap-1">
                {w.map((d) => (
                  <div key={d} title={d} className={`aspect-square rounded-[3px] ${d > today ? 'bg-transparent' : active.has(d) ? 'bg-blue-500 dark:bg-blue-400' : 'bg-slate-100 dark:bg-slate-800'} ${d === today ? 'ring-2 ring-blue-300 dark:ring-blue-700' : ''}`} />
                ))}
              </div>
            ))}
          </div>
          <p className="muted mt-2 text-xs">Last 12 weeks · each square is a day you practised</p>
        </div>
      </div>
    </div>
  );
}
