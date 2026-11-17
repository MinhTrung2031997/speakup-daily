import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { pronunciationCheck } from '../lib/ai';
import { prepareAudio, MAX_CHECK_SECONDS, type AudioClip } from '../lib/audio';
import { errorText } from '../lib/gemini';
import { useAIConfig } from '../lib/hooks';
import { audioRecordingSupported } from '../lib/recorder';
import { useStore } from '../lib/store';
import type { PronunciationResult, PronWord } from '../lib/types';
import { ErrorBox, Spinner } from './ui';
import { useSayWord, WordTryButton } from './WordTry';
import { preferredAccent } from '../lib/speech';

const ISSUE_LABEL: Record<string, string> = {
  'final-consonant': 'Final sound',
  th: '“th” sound',
  's-sh': 's / sh',
  stress: 'Word stress',
  vowel: 'Vowel',
  other: 'Sound',
};
export const issueLabel = (i: string) => ISSUE_LABEL[i] || 'Sound';

const FILLER_RE = /^(um+|uh+|uhm|er+|erm|ah+|hmm+)$/i;
const key = (w: string) => w.toLowerCase().replace(/[^a-z']/g, '');
export const scoreTone = (n: number) => (n >= 85 ? 'text-emerald-600 dark:text-emerald-300' : n >= 70 ? 'text-blue-600 dark:text-blue-300' : 'text-amber-600 dark:text-amber-300');

interface Props {
  /** Recordings of this answer (MicInput onAudio / shadowing take). */
  clips: AudioClip[];
  /** What the learner said (speech recognition), used as a hint. */
  transcript: string;
  /** The text they were trying to say, if any (shadowing sentence, model answer). */
  expected?: string;
  /** Short description for the coach, e.g. "a 60-second retell of a dialogue". */
  context?: string;
  /** Saved result to show (e.g. after a reload). */
  result?: PronunciationResult;
  onResult?: (r: PronunciationResult) => void;
  title?: string;
  /** Target accent for tips, IPA and the word playback (default: the Listen tab choice, else US). */
  accent?: 'US' | 'UK';
}

/**
 * "Check pronunciation" on demand (never automatic): sends the recording to Gemini and shows
 * a score, short notes, the transcript with 3–5 underlined problem words (tap to hear / retry),
 * one rhythm tip and one thing done well. Problem words are saved to "Sounds to fix".
 */
export default function PronunciationCard({ clips, transcript, expected, context, result, onResult, title = '🗣️ Pronunciation', accent: accentProp }: Props) {
  const accent = accentProp || preferredAccent();
  const ai = useAIConfig();
  const { addSounds } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState<number | null>(null);
  const [open, setOpen] = useState<string>('');
  const ref = useRef<HTMLDivElement>(null);

  // A new recording makes the old error irrelevant.
  useEffect(() => { setError(''); }, [clips]);

  const seconds = clips.reduce((a, c) => a + c.seconds, 0);
  const canCheck = clips.length > 0 && audioRecordingSupported();
  if (!result && !canCheck) return null;

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const audio = await prepareAudio(clips);
      if (!audio) throw new Error('No audio was captured. Record your answer with the mic and try again.');
      const r = await pronunciationCheck(ai, audio, { expected, transcript, context, accent });
      if (!r.transcript.trim() && r.score === 0) throw new Error("I couldn't hear any speech in the recording. Check your microphone and try again.");
      setSaved(addSounds(r.words));
      setOpen('');
      onResult?.(r);
      setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 50);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div ref={ref} className="rounded-xl border border-violet-200 bg-violet-50/60 p-3 dark:border-violet-900/60 dark:bg-violet-950/30" data-testid="pronunciation">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{title}</p>
        {result && <span className={`text-xl font-bold ${scoreTone(result.score)}`} data-testid="pron-score">{result.score}<span className="text-xs font-medium text-slate-400">/100</span></span>}
      </div>

      {!result && (
        <div className="mt-2 space-y-2">
          <p className="muted text-xs">Coach Mia listens to your recording{seconds > MAX_CHECK_SECONDS ? ` (first ${MAX_CHECK_SECONDS}s)` : ''} and picks a few sounds to work on.</p>
          <button className="btn-soft" onClick={run} disabled={busy || !ai.hasKey} data-testid="pron-check">
            {busy ? <Spinner /> : <span aria-hidden>🗣️</span>} {busy ? 'Listening to your recording…' : 'Check pronunciation'}
          </button>
        </div>
      )}
      {error && <div className="mt-2"><ErrorBox error={error} onRetry={run} /></div>}

      {result && <PronResult result={result} open={open} setOpen={setOpen} accent={accent} />}

      {result && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs">
          {saved != null ? (
            <span className="text-slate-500">{result.words.length ? <>✅ {saved ? `${saved} new` : 'These'} sound{saved === 1 ? '' : 's'} saved to <Link to="/phrases#sounds" className="font-medium text-blue-600 underline dark:text-blue-300">Sounds to fix</Link></> : 'No problem words this time 🎉'}</span>
          ) : <span />}
          {canCheck && <button className="btn-ghost !px-2.5 !py-1 text-xs" onClick={run} disabled={busy}>{busy ? <Spinner className="h-3.5 w-3.5" /> : '↻'} Check again</button>}
        </div>
      )}
    </div>
  );
}

/** The result body (also used read-only in History). */
export function PronResult({ result, open, setOpen, accent }: { result: PronunciationResult; open: string; setOpen: (w: string) => void; accent?: 'US' | 'UK' }) {
  const say = useSayWord(accent);
  // Match the transcript by the target word, or by how it sounded ("tree" for three) when the
  // transcript spells what was heard.
  const problems = useMemo(() => {
    const m = new Map<string, PronWord>(result.words.map((w) => [key(w.word), w]));
    for (const w of result.words) {
      const h = key(w.heard || '');
      if (h && !/\s/.test(w.heard.trim()) && !m.has(h)) m.set(h, w);
    }
    return m;
  }, [result.words]);
  const tokens = useMemo(() => result.transcript.split(/(\s+)/), [result.transcript]);
  const firstAt = useMemo(() => {
    const m = new Map<string, number>();
    const seen = new Set<string>();
    tokens.forEach((t, i) => {
      const k = key(t);
      const w = problems.get(k);
      if (w && !seen.has(key(w.word))) { seen.add(key(w.word)); m.set(k, i); }
    });
    return m;
  }, [tokens, problems]);
  const found = new Set([...firstAt.keys()].map((k) => key(problems.get(k)!.word)));
  const extra = result.words.filter((w) => !found.has(key(w.word)));
  const active = open ? problems.get(open) : undefined;
  const tap = (w: PronWord) => {
    const k = key(w.word);
    setOpen(open === k ? '' : k);
    if (open !== k) say(w.word);
  };
  const isOpen = (t: string) => {
    const w = problems.get(key(t));
    return !!w && open === key(w.word);
  };

  return (
    <div className="mt-2 space-y-2.5">
      <div className="grid gap-1 text-sm">
        {result.clarity && <p><span className="font-medium text-slate-500">Clarity:</span> {result.clarity}</p>}
        {result.intonation && <p><span className="font-medium text-slate-500">Intonation:</span> {result.intonation}</p>}
        {result.pace && <p><span className="font-medium text-slate-500">Pace:</span> {result.pace}{result.wpm ? ` (${result.wpm} wpm)` : ''}</p>}
      </div>

      {result.transcript && (
        <div className="rounded-lg bg-white p-2.5 text-[15px] leading-relaxed dark:bg-slate-900" data-testid="pron-transcript">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">What I heard · tap an underlined word</p>
          <p>
            {tokens.map((t, i) => {
              // Underline only the first time each problem word appears: coaching, not a wall of red.
              const w = problems.get(key(t));
              if (w && firstAt.get(key(t)) === i) {
                return (
                  <button key={i} type="button" onClick={() => tap(w)} data-testid="pron-word"
                    className={`rounded px-0.5 font-medium underline decoration-amber-500 decoration-wavy decoration-2 underline-offset-4 ${isOpen(t) ? 'bg-amber-100 dark:bg-amber-500/20' : ''}`}>
                    {t}
                  </button>
                );
              }
              if (FILLER_RE.test(key(t))) return <span key={i} className="italic text-slate-400">{t}</span>;
              return <span key={i}>{t}</span>;
            })}
          </p>
          {extra.length > 0 && (
            <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">Also:
              {extra.map((w) => <button key={w.word} type="button" onClick={() => tap(w)} data-testid="pron-word" className="chip bg-amber-100 text-amber-800 underline decoration-wavy dark:bg-amber-400/15 dark:text-amber-200">{w.word}</button>)}
            </p>
          )}
        </div>
      )}
      {!result.transcript && result.words.length > 0 && (
        <div className="flex flex-wrap gap-1.5">{result.words.map((w) => <button key={w.word} type="button" onClick={() => tap(w)} data-testid="pron-word" className="chip bg-amber-100 text-amber-800 underline decoration-wavy">{w.word}</button>)}</div>
      )}

      {active && <WordPanel w={active} accent={accent} />}

      {result.rhythmTip && <p className="rounded-lg bg-blue-50 p-2.5 text-sm text-blue-900 dark:bg-blue-950/50 dark:text-blue-100">🎵 <b>Rhythm:</b> {result.rhythmTip}</p>}
      {result.wellDone && <p className="rounded-lg bg-emerald-50 p-2.5 text-sm text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100">👏 {result.wellDone}</p>}
    </div>
  );
}

function WordPanel({ w, accent }: { w: PronWord; accent?: 'US' | 'UK' }) {
  const say = useSayWord(accent);
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 dark:border-amber-900/60 dark:bg-amber-950/30" data-testid="pron-panel">
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="text-lg font-bold">{w.word}</span>
        {w.ipa && <span className="font-mono text-sm text-slate-500">/{w.ipa}/</span>}
        <span className="chip bg-white text-[11px] text-amber-800 dark:bg-slate-900 dark:text-amber-200">{issueLabel(w.issue)}</span>
      </div>
      {w.heard && w.heard.toLowerCase() !== w.word.toLowerCase() && <p className="text-xs text-slate-500">Sounded like “{w.heard}”</p>}
      <p className="mt-1 text-sm">💡 {w.tip}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-soft !px-2.5 !py-1.5 text-xs" onClick={() => say(w.word)} data-testid="pron-play">▶ Hear it</button>
        <WordTryButton word={w.word} compact />
      </div>
    </div>
  );
}
