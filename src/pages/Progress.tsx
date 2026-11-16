import { useStore } from '../lib/store';
import { addDays, lastNDays, todayStr } from '../lib/date';
import { activeDates, dictationByDay, fluencyByDay, fluencyRecords, listeningStats, phraseStats, streak } from '../lib/stats';
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
  const flu = fluencyByDay(state, days);
  const fluData = (key: 'wpm' | 'fillersPer100' | 'restarts' | 'pauses') => flu.map((d) => ({ label: short(d.date), value: d[key], title: d.count ? `${d.date}: ${d[key]} (${d.count} spoken answer${d.count > 1 ? 's' : ''})` : `${d.date}: no spoken answers` }));
  const fluRecs = fluencyRecords(state);
  const recent = [...fluRecs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const avgOf = (k: 'wpm' | 'restarts' | 'pauses') => (recent.length ? Math.round((recent.reduce((a, r) => a + r[k], 0) / recent.length) * 10) / 10 : 0);
  const recentWords = recent.reduce((a, r) => a + r.words, 0);
  const recentFillers = recentWords ? Math.round((recent.reduce((a, r) => a + r.fillers, 0) / recentWords) * 1000) / 10 : 0;
  const ls = listeningStats(state);
  const dictData = dictationByDay(state, days).map((d) => ({ label: short(d.date), value: d.accuracy, title: d.count ? `${d.date}: ${d.accuracy}% (${d.count} dictation${d.count > 1 ? 's' : ''})` : `${d.date}: no dictation` }));
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

      <div className="card">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="h-section">🎧 Listening</h2>
            <p className="muted text-xs">Dictation accuracy · last 14 days</p>
          </div>
          <p className="text-xs text-slate-500">
            <b>{ls.sessions}</b> drills · questions <b>{ls.questionPct ?? '–'}{ls.questionPct != null ? '%' : ''}</b> right · dictation (last 5) <b>{ls.recentAccuracy ?? '–'}{ls.recentAccuracy != null ? '%' : ''}</b> · <b>{ls.retells}</b> retells
          </p>
        </div>
        {ls.dictations ? (
          <BarChart data={dictData} color="fill-orange-500" unit="%" />
        ) : (
          <p className="muted rounded-xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">🎧 Do a dictation on the Listen tab to start tracking your accuracy.</p>
        )}
      </div>

      <div className="card">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="h-section">🗣️ Fluency trends</h2>
            <p className="muted text-xs">Last 14 days · from answers you spoke with the mic</p>
          </div>
          {recent.length > 0 && <p className="text-xs text-slate-500">Last {recent.length}: <b>{Math.round(avgOf('wpm'))}</b> wpm · <b>{recentFillers}</b> fillers/100 words · <b>{avgOf('restarts')}</b> restarts · <b>{avgOf('pauses')}</b> long pauses</p>}
        </div>
        {fluRecs.length ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium">Pace <span className="text-xs font-normal text-slate-400">words per minute (aim 110–160)</span></p>
              <BarChart data={fluData('wpm')} color="fill-sky-500" unit=" wpm" />
            </div>
            <div>
              <p className="text-sm font-medium">Fillers <span className="text-xs font-normal text-slate-400">per 100 words (lower is better)</span></p>
              <BarChart data={fluData('fillersPer100')} color="fill-amber-500" />
            </div>
            <div>
              <p className="text-sm font-medium">Restarts <span className="text-xs font-normal text-slate-400">per answer, like “I think I think”</span></p>
              <BarChart data={fluData('restarts')} color="fill-violet-500" />
            </div>
            <div>
              <p className="text-sm font-medium">Long pauses <span className="text-xs font-normal text-slate-400">over 2s, per answer</span></p>
              <BarChart data={fluData('pauses')} color="fill-rose-400" />
            </div>
          </div>
        ) : (
          <p className="muted rounded-xl border border-dashed border-slate-300 p-6 text-center dark:border-slate-700">🎙️ Answer today's question with the mic to start tracking your pace, filler words, restarts and pauses.</p>
        )}
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
