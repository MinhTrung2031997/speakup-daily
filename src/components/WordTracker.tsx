// Word tracker (on Progress): passive vs active words, progress of each word toward 3 Natural uses,
// and his most overused words (counted in code) with better-word swaps.
import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../lib/store';
import { useAIConfig } from '../lib/hooks';
import { overusedSwaps } from '../lib/ai';
import { errorText } from '../lib/gemini';
import { addDays, todayStr } from '../lib/date';
import { ACTIVE_AT, MIN_ANSWERS, WINDOW, activationDates, analyzeOverused, huntKey, naturalRefs, sentencesWith, spokenAnswers } from '../lib/hunt';
import BarChart from './BarChart';
import { HUNT_UI } from './HuntCards';
import { ErrorBox, Spinner } from './ui';

const TREND = { up: { icon: '↑', cls: 'text-rose-600 dark:text-rose-300', label: 'more than before' }, down: { icon: '↓', cls: 'text-emerald-600 dark:text-emerald-300', label: 'less than before' }, flat: { icon: '→', cls: 'text-slate-500', label: 'about the same' }, new: { icon: '•', cls: 'text-slate-400', label: 'not enough answers for a trend yet' } } as const;

export default function WordTracker() {
  const { state, update } = useStore();
  const ai = useAIConfig();
  const [all, setAll] = useState(false);
  const [openWord, setOpenWord] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (location.hash === '#words') setTimeout(() => document.getElementById('words')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150);
  }, []);

  const uses = state.hunt.uses;
  const refs = useMemo(() => naturalRefs(uses), [uses]);
  const acts = useMemo(() => activationDates(uses), [uses]);
  const bank = state.phrases;
  const rows = useMemo(() => bank.map((p) => {
    const k = huntKey(p.phrase);
    const mine = uses.filter((u) => huntKey(u.phrase) === k);
    const n = refs.get(k)?.size || 0;
    return { phrase: p.phrase, n, active: n >= ACTIVE_AT, tried: mine.filter((u) => u.level !== 'absent').length, last: [...mine].filter((u) => u.level !== 'absent').sort((a, b) => b.createdAt - a.createdAt)[0] };
  }), [bank, uses, refs]);
  const active = rows.filter((r) => r.active);
  const progress = rows.filter((r) => !r.active && (r.n > 0 || r.tried > 0)).sort((a, b) => b.n - a.n || (b.last?.createdAt || 0) - (a.last?.createdAt || 0));
  const passive = rows.length - active.length - progress.length;

  // Active words per week (cumulative), last 8 weeks.
  const today = todayStr();
  const weekStarts = Array.from({ length: 8 }, (_, i) => addDays(today, -7 * (7 - i)));
  const chart = weekStarts.map((w, i) => {
    const end = i === 7 ? today : addDays(weekStarts[i + 1], -1);
    const v = [...acts.values()].filter((d) => d <= end).length;
    return { label: w.slice(8) + '/' + w.slice(5, 7), value: v, title: `Active by ${end}: ${v}` };
  });

  const spoken = useMemo(() => spokenAnswers(state), [state]);
  const report = useMemo(() => analyzeOverused(spoken), [spoken]);
  const swapsOf = (w: string) => state.hunt.swaps.find((x) => x.word === w);

  const showSwaps = async (word: string) => {
    if (openWord === word) { setOpenWord(null); return; }
    setOpenWord(word); setError('');
    if (swapsOf(word)) return;
    setLoading(word);
    try {
      const swaps = await overusedSwaps(ai, word, sentencesWith(spoken, word));
      update((s) => ({ ...s, hunt: { ...s.hunt, swaps: [...s.hunt.swaps.filter((x) => x.word !== word), { word, swaps, createdAt: Date.now() }] } }));
    } catch (e) { setError(errorText(e)); } finally { setLoading(null); }
  };

  const shown = all ? progress : progress.slice(0, 6);
  return (
    <section id="words" className="card scroll-mt-20 space-y-5" data-testid="word-tracker">
      <div>
        <h2 className="h-section">🎯 Word tracker</h2>
        <p className="muted text-xs">A word is active after you use it naturally, by voice, in {ACTIVE_AT} different answers.</p>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center" data-testid="tracker-stats">
        <div className="rounded-xl bg-emerald-50 p-2 dark:bg-emerald-950/40"><p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300" data-testid="stat-active">{active.length}</p><p className="text-xs text-slate-600 dark:text-slate-300">Active</p></div>
        <div className="rounded-xl bg-amber-50 p-2 dark:bg-amber-950/30"><p className="text-2xl font-bold text-amber-700 dark:text-amber-300" data-testid="stat-progress">{progress.length}</p><p className="text-xs text-slate-600 dark:text-slate-300">In progress</p></div>
        <div className="rounded-xl bg-slate-100 p-2 dark:bg-slate-800"><p className="text-2xl font-bold text-slate-700 dark:text-slate-200" data-testid="stat-passive">{passive}</p><p className="text-xs text-slate-600 dark:text-slate-300">Passive (saved, not used yet)</p></div>
      </div>

      {rows.length === 0 ? (
        <p className="muted text-sm">Save some phrases first (Words, Say it better, or your upgraded answers). Each day the app picks 3 to try in your daily question.</p>
      ) : (
        <>
          <div>
            <p className="mb-1 text-sm font-semibold text-slate-800 dark:text-slate-100">Active words over time</p>
            <BarChart data={chart} color="fill-emerald-500" unit=" active" />
          </div>

          <div data-testid="tracker-progress">
            <p className="mb-2 text-sm font-semibold text-slate-800 dark:text-slate-100">On the way to {ACTIVE_AT} natural uses</p>
            {progress.length === 0 ? <p className="muted text-sm">Answer by voice and use today's “🎯 Try to use” words. They show up here.</p> : (
              <ul className="space-y-2">
                {shown.map((r) => (
                  <li key={r.phrase} className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60" data-testid="tracker-word">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-slate-900 dark:text-white">{r.phrase}</span>
                      <span className="flex gap-1" aria-label={`${r.n} of ${ACTIVE_AT} natural uses`}>{Array.from({ length: ACTIVE_AT }, (_, i) => <span key={i} className={`h-2.5 w-2.5 rounded-full ${i < r.n ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />)}</span>
                      <span className="text-xs text-slate-500">{r.n}/{ACTIVE_AT}</span>
                      {r.last && <span className={`text-xs ${HUNT_UI[r.last.level].cls}`}>last: {HUNT_UI[r.last.level].icon} {HUNT_UI[r.last.level].label}</span>}
                    </div>
                    {r.last?.evidence && <p className="mt-1 text-sm italic text-slate-600 dark:text-slate-300">“{r.last.evidence}”</p>}
                  </li>
                ))}
              </ul>
            )}
            {progress.length > 6 && <button className="btn-ghost mt-2 !py-1 text-xs" onClick={() => setAll((v) => !v)}>{all ? 'Show fewer' : `Show all ${progress.length}`}</button>}
          </div>

          {active.length > 0 && (
            <div data-testid="tracker-active">
              <p className="mb-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">🎉 Active words</p>
              <div className="flex flex-wrap gap-1.5">{active.map((r) => <span key={r.phrase} className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">{r.phrase}</span>)}</div>
            </div>
          )}
        </>
      )}

      <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800" data-testid="overused">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Words you use a lot</p>
          <p className="muted text-xs">Counted from your last {WINDOW} spoken answers ({report.answers} so far). Counted by the app itself, no AI.</p>
        </div>
        {report.answers < MIN_ANSWERS ? (
          <p className="muted text-sm" data-testid="overused-empty">Answer out loud at least {MIN_ANSWERS} times and your most-used words will show here.</p>
        ) : report.rows.length === 0 ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300" data-testid="overused-none">Nice, no word stands out as overused right now. 🎉</p>
        ) : (
          <ul className="space-y-2">
            {report.rows.map((r) => {
              const t = TREND[r.trend];
              const sw = swapsOf(r.word);
              return (
                <li key={r.word} className="rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800/60" data-testid="overused-row" data-word={r.word}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-semibold text-slate-900 dark:text-white">“{r.word === "i think" ? "I think" : r.word}”</span>
                    <span className="chip bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200">×{r.total}</span>
                    <span className="text-xs text-slate-500">in {r.inAnswers} of {report.answers} answers{r.max >= 3 ? ` · up to ${r.max} in one` : ''}</span>
                    <span className={`text-xs font-semibold ${t.cls}`} title={t.label} data-testid="trend">{t.icon}<span className="sr-only"> {t.label}</span></span>
                    <button className="btn-soft ml-auto !px-3 !py-1 text-xs" onClick={() => showSwaps(r.word)} aria-expanded={openWord === r.word} data-testid="swaps-btn">{loading === r.word ? <Spinner className="h-3.5 w-3.5" /> : '✨'} Better words</button>
                  </div>
                  {openWord === r.word && sw && (
                    <ul className="mt-2 space-y-1.5" data-testid="swaps">
                      {sw.swaps.map((x) => (
                        <li key={x.phrase} className="text-sm"><span className="chip bg-blue-50 font-semibold text-blue-800 dark:bg-blue-950 dark:text-blue-200">{x.phrase}</span> <span className="text-slate-600 dark:text-slate-300">{x.example}</span></li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {report.answers >= MIN_ANSWERS && (
          <p className="text-xs text-slate-500" data-testid="fillers">Fillers: {report.fillers.length ? report.fillers.slice(0, 4).map((f) => `${f.word} ×${f.total}`).join(', ') : 'none'} · {report.fillerPerAnswer.toFixed(1)} per answer</p>
        )}
        <ErrorBox error={error} />
      </div>
    </section>
  );
}
