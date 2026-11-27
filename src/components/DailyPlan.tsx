// Today's plan card (top of Home): 2-4 steps, ticked automatically from saved activity, with a celebration when done.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useTodayPlan } from '../lib/usePlan';
import { planMessage } from '../lib/plan';

const ICON: Record<string, string> = { question: '🎙️', reviews: '📚', redo: '🔁', extra: '⚡' };
const CONFETTI = ['🎉', '✨', '🔥', '⭐', '🎊', '💪', '🗣️'];

export default function DailyPlanCard() {
  const { state } = useStore();
  const plan = useTodayPlan();
  const nav = useNavigate();
  const loc = useLocation();
  const ref = useRef<HTMLElement>(null);
  const [burst, setBurst] = useState(false);
  const [highlight, setHighlight] = useState(false);
  const done = plan ? plan.items.filter((i) => i.done).length : 0;
  const total = plan?.items.length || 0;
  const complete = !!plan?.completedAt;
  const msg = useMemo(() => (plan ? planMessage(state, plan) : null), [state, plan]);

  // Opened from a notification (/?plan=1#plan): scroll here and glow.
  useEffect(() => {
    if (loc.hash === '#plan' || new URLSearchParams(loc.search).has('plan')) {
      setTimeout(() => { ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setHighlight(true); }, 150);
    }
  }, [loc.hash, loc.search]);

  // Celebrate once per day when the last step ticks.
  useEffect(() => {
    if (!plan || !complete) return;
    const k = `speakup.planDone.${plan.date}`;
    try { if (localStorage.getItem(k)) return; localStorage.setItem(k, '1'); } catch { /* private mode */ }
    setBurst(true);
    const t = setTimeout(() => setBurst(false), 2200);
    return () => clearTimeout(t);
  }, [complete, plan]);

  if (!plan) return null;
  const totalMins = plan.items.reduce((a, i) => a + i.mins, 0);

  const go = (link: string) => {
    if (link === '/#question') {
      document.getElementById('question')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    nav(link);
  };

  return (
    <section ref={ref} id="plan" data-testid="plan-card" data-complete={complete ? '1' : '0'}
      className={`card relative overflow-hidden ${complete ? 'border-emerald-300 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-950/30' : ''} ${highlight ? 'plan-highlight' : ''}`}>
      {burst && (
        <div className="pointer-events-none absolute inset-0" aria-hidden="true" data-testid="plan-confetti">
          {Array.from({ length: 14 }).map((_, i) => (
            <span key={i} className="plan-confetti" style={{ left: `${5 + ((i * 37) % 90)}%`, animationDelay: `${(i % 5) * 0.12}s`, ['--r' as string]: `${(i % 2 ? 1 : -1) * (10 + i * 7)}deg` }}>{CONFETTI[i % CONFETTI.length]}</span>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="h-section">📋 Today's plan</h2>
          <p className="muted text-xs">{complete ? 'All done for today' : `${done}/${total} done · about ${totalMins} min in total`}{plan.light ? ' · light day' : ''}</p>
        </div>
        <span className="chip bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-200" data-testid="plan-streak">🔥 {plan.streak} day{plan.streak === 1 ? '' : 's'}</span>
      </div>

      {msg && (
        <div className={`mt-3 rounded-xl px-3 py-2 text-sm ${complete ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-100' : 'bg-blue-50 text-blue-900 dark:bg-blue-950/50 dark:text-blue-100'}`} data-testid="plan-message">
          <p className="font-semibold">{complete ? '🎉 ' : ''}{msg.title}</p>
          <p>{msg.body}</p>
        </div>
      )}

      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden="true">
        <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </div>

      <ol className="mt-3 space-y-2">
        {plan.items.map((i) => (
          <li key={i.id} data-testid="plan-item" data-kind={i.kind} data-done={i.done ? '1' : '0'}
            className={`flex items-center gap-3 rounded-xl border p-2.5 ${i.done ? 'border-emerald-200 bg-white/60 dark:border-emerald-900 dark:bg-slate-900/40' : 'border-slate-200 dark:border-slate-700'}`}>
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm ${i.done ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-800'}`} aria-label={i.done ? 'Done' : 'To do'}>
              {i.done ? '✓' : ICON[i.kind]}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-semibold ${i.done ? 'text-slate-500 line-through decoration-emerald-500/60' : ''}`}>{i.title} <span className="font-normal text-slate-400">· {i.mins} min</span></p>
              <p className="truncate text-xs text-slate-500" title={i.detail}>{i.detail}</p>
            </div>
            {!i.done && (
              i.link.startsWith('/#')
                ? <button className="btn-soft shrink-0 !px-3 !py-1.5 text-xs" onClick={() => go(i.link)} data-testid="plan-go">Start</button>
                : <Link to={i.link} className="btn-soft shrink-0 !px-3 !py-1.5 text-xs" data-testid="plan-go">Start</Link>
            )}
          </li>
        ))}
      </ol>
      {!complete && plan.light && <p className="mt-2 text-xs text-slate-500">You missed yesterday, so today is a short plan. Do the question and reviews to keep the streak going.</p>}
      {!complete && !plan.light && <p className="mt-2 text-xs text-slate-500">The streak counts when the question and the reviews are done.</p>}
      <p className="mt-1 text-xs"><Link to="/settings#reminders" className="text-blue-600 hover:underline dark:text-blue-400" data-testid="plan-reminders-link">⏰ Reminder settings</Link></p>
    </section>
  );
}
