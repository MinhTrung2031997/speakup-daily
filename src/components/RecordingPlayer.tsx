import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { recordingUrl } from '../lib/db';
import type { RecordingItem } from '../lib/types';
import { Spinner } from './ui';
import Icon from './Icon';

const KIND_LABEL: Record<RecordingItem['kind'], string> = { answer: 'Answer', retry: 'Try again', builder: 'Say it your way', retell: 'Retell', shadowing: 'Shadowing' };
const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
export const fmtMB = (bytes: number) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** Play a saved recording (signed URL fetched on first play) with progress, ⭐ favourite and delete. */
export default function RecordingPlayer({ rec, label, compact = false }: { rec: RecordingItem; label?: string; compact?: boolean }) {
  const { toggleStar, removeRecording } = useStore();
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'playing' | 'paused'>('idle');
  const [pos, setPos] = useState(0);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const total = rec.seconds || 0;

  useEffect(() => () => { audio.current?.pause(); }, []);

  const play = async () => {
    setError('');
    if (state === 'playing') { audio.current?.pause(); return; }
    try {
      if (!audio.current) {
        setState('loading');
        const a = new Audio();
        a.preload = 'auto';
        a.ontimeupdate = () => setPos(a.currentTime);
        a.onplay = () => setState('playing');
        a.onpause = () => setState('paused');
        a.onended = () => { setState('idle'); setPos(0); };
        a.onerror = () => { setState('idle'); setError('Could not play this recording.'); };
        a.src = await recordingUrl(rec.path);
        audio.current = a;
      }
      await audio.current.play();
    } catch (e) {
      setState('idle');
      setError(e instanceof Error && /signed|url|not found/i.test(e.message) ? 'Recording not found.' : 'Could not play this recording.');
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audio.current;
    if (!a || !total) return;
    const r = e.currentTarget.getBoundingClientRect();
    a.currentTime = Math.max(0, Math.min(total, ((e.clientX - r.left) / r.width) * total));
  };

  const del = async () => {
    if (!confirm('Delete this recording? The transcript and scores stay.')) return;
    setDeleting(true);
    try { audio.current?.pause(); await removeRecording(rec.id); } catch { setError('Could not delete it. Please try again.'); setDeleting(false); }
  };

  const pct = total ? Math.min(100, (pos / total) * 100) : 0;
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900 ${compact ? '' : 'sm:p-3'}`} data-recording={rec.id}>
      <div className="flex items-center gap-2.5">
        <button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white dark:bg-blue-500 dark:text-slate-950" onClick={play} title={state === 'playing' ? 'Pause' : 'Play recording'} aria-label={state === 'playing' ? 'Pause' : 'Play recording'}>
          {state === 'loading' ? <Spinner className="h-4 w-4" /> : <Icon name={state === 'playing' ? 'pause' : 'play'} className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="truncate">{label || KIND_LABEL[rec.kind]} · {new Date(rec.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
            <span className="shrink-0 tabular-nums">{fmt(pos)} / {fmt(total)}</span>
          </div>
          <div className="mt-1.5 h-1.5 cursor-pointer rounded-full bg-slate-200 dark:bg-slate-700" onClick={seek} role="progressbar" aria-valuemin={0} aria-valuemax={Math.round(total)} aria-valuenow={Math.round(pos)}>
            <div className="h-full rounded-full bg-blue-600 transition-[width] dark:bg-blue-400" style={{ width: `${pct}%` }} />
          </div>
        </div>
        <button className={`shrink-0 rounded-lg px-1.5 py-1 text-lg leading-none ${rec.starred ? '' : 'opacity-40 grayscale hover:opacity-80'}`} onClick={() => toggleStar(rec.id)} title={rec.starred ? 'Unstar' : 'Star (favourite)'} aria-pressed={rec.starred} data-testid="star">⭐</button>
        <button className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:text-rose-600" onClick={del} disabled={deleting} title="Delete recording" data-testid="delete-recording">
          {deleting ? <Spinner className="h-4 w-4" /> : <Icon name="trash" className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-rose-600 dark:text-rose-400">{error}</p>}
    </div>
  );
}

/** The recordings of one answer / retell. */
export function RecordingList({ recs, title = '🎧 Your recordings' }: { recs: RecordingItem[]; title?: string }) {
  if (!recs.length) return null;
  return (
    <div className="space-y-1.5" data-testid="recordings">
      <p className="text-xs font-semibold text-slate-500">{title}</p>
      {recs.map((r) => <RecordingPlayer key={r.id} rec={r} />)}
    </div>
  );
}

/** "Compare": your oldest and newest recording for the same question type, one under the other. */
export function CompareRecordings({ recs }: { recs: RecordingItem[] }) {
  const byType = new Map<string, RecordingItem[]>();
  for (const r of recs) {
    if (r.kind === 'shadowing' || r.kind === 'retell' || !r.questionType) continue;
    byType.set(r.questionType, [...(byType.get(r.questionType) || []), r]);
  }
  const types = [...byType.entries()].filter(([, l]) => l.length >= 2).sort((a, b) => b[1].length - a[1].length).map(([t]) => t);
  const [type, setType] = useState('');
  const t = types.includes(type) ? type : types[0];
  if (!t) return null;
  const list = [...(byType.get(t) || [])].sort((a, b) => a.createdAt - b.createdAt);
  const first = list[0];
  const last = list[list.length - 1];
  const days = Math.max(0, Math.round((last.createdAt - first.createdAt) / 86400000));
  return (
    <section className="card space-y-2" data-testid="compare">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="h-section text-base">🎧 Compare: then vs now</h2>
        {types.length > 1 && (
          <select className="input !w-auto !py-1 text-xs" value={t} onChange={(e) => setType(e.target.value)} aria-label="Question type">
            {types.map((x) => <option key={x}>{x}</option>)}
          </select>
        )}
      </div>
      <p className="muted text-xs">{t} questions · {list.length} recordings · {days ? `${days} day${days > 1 ? 's' : ''} apart` : 'same day'}</p>
      <RecordingPlayer rec={first} label="Then" compact />
      <RecordingPlayer rec={last} label="Now" compact />
    </section>
  );
}
