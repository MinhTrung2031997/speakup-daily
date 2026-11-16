import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { matchScore, markPhrases, splitSentences } from '../lib/diff';
import { useRecorder, type Recording } from '../lib/recorder';
import { speak, stopSpeaking, ttsSupported } from '../lib/speech';
import { useStore } from '../lib/store';
import Icon from './Icon';
import { Spinner } from './ui';

type Phase = 'idle' | 'model' | 'recording' | 'saving' | 'compare';
interface Take extends Recording { score: number | null }

const scoreColor = (n: number) => (n >= 80 ? 'text-emerald-600 dark:text-emerald-300' : n >= 50 ? 'text-blue-600 dark:text-blue-300' : 'text-amber-600 dark:text-amber-300');

/** speechSynthesis sometimes never fires onend (e.g. no voices); don't let that freeze the flow. */
function speakSafe(text: string, opts: { voiceURI: string; rate: number }) {
  const words = text.split(/\s+/).length;
  const limit = ((words * 0.45) / opts.rate + 3) * 1000;
  return Promise.race([speak(text, opts), new Promise<void>((r) => setTimeout(r, limit))]);
}

function playUrl(url: string, audioRef: MutableRefObject<HTMLAudioElement | null>) {
  return new Promise<void>((resolve) => {
    audioRef.current?.pause();
    const a = new Audio(url);
    audioRef.current = a;
    a.onended = () => resolve();
    a.onerror = () => resolve();
    a.onpause = () => resolve();
    a.play().catch(() => resolve());
  });
}

/**
 * Shadowing: listen to one sentence, repeat it, then hear the model and yourself back to back.
 * Recordings live only in memory (object URLs) and are revoked on re-record and on close.
 */
export default function ShadowPractice({ text, phrases = [], onClose }: { text: string; phrases?: string[]; onClose?: () => void }) {
  const { state, addSpeaking, logActivity } = useStore();
  const { rate, voiceURI } = state.settings;
  const sentences = useMemo(() => splitSentences(text), [text]);
  const rec = useRecorder();
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [takes, setTakes] = useState<Record<number, Take>>({});
  const takesRef = useRef(takes);
  takesRef.current = takes;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const runId = useRef(0);
  const autoStop = useRef<ReturnType<typeof setTimeout>>();
  const logged = useRef(false);

  const sentence = sentences[idx] || '';
  const take = takes[idx];
  const tts = ttsSupported();

  const halt = () => {
    runId.current++;
    stopSpeaking();
    audioRef.current?.pause();
    clearTimeout(autoStop.current);
  };

  // Revoke every object URL when the shadowing panel closes or the text changes.
  useEffect(() => () => {
    halt();
    Object.values(takesRef.current).forEach((t) => t.url && URL.revokeObjectURL(t.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  const finishRecording = async () => {
    clearTimeout(autoStop.current);
    setPhase('saving');
    const r = await rec.stop();
    setPhase('idle');
    if (!r) return;
    addSpeaking(r.seconds);
    if (!logged.current) {
      logged.current = true;
      logActivity();
    }
    setTakes((all) => {
      const old = all[idx];
      if (old?.url && old.url !== r.url) URL.revokeObjectURL(old.url);
      return { ...all, [idx]: { ...r, score: rec.canTranscribe ? matchScore(sentence, r.transcript).score : null } };
    });
  };

  const record = async () => {
    halt();
    const ok = await rec.start();
    if (!ok) return;
    setPhase('recording');
    // Auto-stop with a generous limit in case the user forgets to press stop.
    const words = sentence.split(/\s+/).length;
    autoStop.current = setTimeout(() => finishRecordingRef.current(), Math.min(30, words * 0.8 + 5) * 1000);
  };
  const finishRecordingRef = useRef(finishRecording);
  finishRecordingRef.current = finishRecording;

  /** Step 1: play the model sentence, then start recording automatically. */
  const listenAndRepeat = async () => {
    halt();
    const id = runId.current;
    if (tts) {
      setPhase('model');
      await speakSafe(sentence, { voiceURI, rate });
      if (runId.current !== id) return;
    }
    setPhase('idle');
    if (rec.supported) record();
  };

  const listenOnly = async () => {
    halt();
    const id = runId.current;
    setPhase('model');
    await speakSafe(sentence, { voiceURI, rate });
    if (runId.current === id) setPhase('idle');
  };

  /** Model, then the user's own recording, back to back. */
  const compare = async () => {
    if (!take?.url) return;
    halt();
    const id = runId.current;
    setPhase('compare');
    if (tts) await speakSafe(sentence, { voiceURI, rate });
    if (runId.current !== id) return;
    await new Promise((r) => setTimeout(r, 350));
    if (runId.current !== id) return;
    await playUrl(take.url, audioRef);
    if (runId.current === id) setPhase('idle');
  };

  const go = (n: number) => {
    if (rec.recording) return;
    halt();
    setPhase('idle');
    setIdx(Math.max(0, Math.min(sentences.length - 1, n)));
  };

  const scored = Object.values(takes).filter((t) => t.score !== null);
  const avg = scored.length ? Math.round(scored.reduce((a, t) => a + (t.score || 0), 0) / scored.length) : null;
  const words = take && take.score !== null ? matchScore(sentence, take.transcript).words : null;
  const busy = phase === 'recording' || phase === 'saving';

  if (!sentences.length) return null;

  return (
    <div className="space-y-3" data-testid="shadowing">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sentence {idx + 1} of {sentences.length}</p>
        <div className="flex items-center gap-2">
          {avg !== null && <span className={`chip bg-slate-100 dark:bg-slate-800 ${scoreColor(avg)}`}>Average {avg}%</span>}
          {onClose && <button className="btn-ghost !p-1.5" onClick={() => { halt(); onClose(); }} title="Close shadowing"><Icon name="x" className="h-4 w-4" /></button>}
        </div>
      </div>

      {/* Progress dots */}
      <div className="flex flex-wrap gap-1.5">
        {sentences.map((_, i) => {
          const t = takes[i];
          const done = !!t;
          return (
            <button
              key={i}
              onClick={() => go(i)}
              title={t?.score != null ? `Sentence ${i + 1}: ${t.score}%` : `Sentence ${i + 1}`}
              className={`h-2.5 flex-1 min-w-[18px] rounded-full transition ${i === idx ? 'ring-2 ring-blue-300 dark:ring-blue-700' : ''} ${done ? (t.score == null || t.score >= 80 ? 'bg-emerald-500' : t.score >= 50 ? 'bg-blue-500' : 'bg-amber-500') : 'bg-slate-200 dark:bg-slate-700'}`}
            />
          );
        })}
      </div>

      <div className={`rounded-xl border p-4 text-lg font-medium leading-relaxed transition ${phase === 'model' || phase === 'compare' ? 'border-blue-300 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40' : 'border-slate-200 dark:border-slate-700'}`}>
        {markPhrases(sentence, phrases).map((c, j) => (c.hit ? <mark key={j} className="mark-phrase">{c.text}</mark> : <span key={j}>{c.text}</span>))}
      </div>

      {/* Main controls */}
      <div className="flex flex-wrap items-center gap-2">
        {phase === 'recording' ? (
          <button className="btn !bg-rose-500 text-white hover:!bg-rose-600" onClick={finishRecording}>
            <Icon name="stop" className="h-4 w-4" /> Stop
          </button>
        ) : (
          <button className="btn-primary" onClick={listenAndRepeat} disabled={busy || (!tts && !rec.supported)}>
            {phase === 'model' ? <Spinner /> : <Icon name={take ? 'refresh' : 'mic'} className="h-4 w-4" />}
            {phase === 'model' ? 'Listen…' : take ? 'Listen & re-record' : 'Listen & repeat'}
          </button>
        )}
        {tts && <button className="btn-soft" onClick={listenOnly} disabled={busy}><Icon name="play" className="h-4 w-4" /> Model</button>}
        {take?.url && (
          <button className="btn-soft" onClick={compare} disabled={busy}>
            <Icon name="ear" className="h-4 w-4" /> {phase === 'compare' ? 'Playing…' : 'Model + me'}
          </button>
        )}
        {rec.supported && phase !== 'recording' && take && (
          <button className="btn-ghost" onClick={record} disabled={busy} title="Record again without the model first"><Icon name="mic" className="h-4 w-4" /> Re-record</button>
        )}
      </div>

      {phase === 'recording' && (
        <p className="text-sm font-medium text-rose-600 dark:text-rose-300">● Recording… say the sentence, then press stop.{rec.interim && <span className="ml-1 font-normal italic text-slate-500"> “{rec.interim}”</span>}</p>
      )}
      {phase === 'saving' && <p className="muted flex items-center gap-2"><Spinner className="h-3.5 w-3.5" /> Checking…</p>}

      {/* Result for this sentence */}
      {take && phase !== 'recording' && phase !== 'saving' && (
        <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
          {take.score !== null ? (
            <>
              <p className="flex items-center gap-2">
                <span className={`text-xl font-bold ${scoreColor(take.score)}`}>{take.score}%</span>
                <span className="text-slate-600 dark:text-slate-300">{take.score >= 90 ? 'Excellent match! 🎉' : take.score >= 70 ? 'Close! Try once more for the missing words.' : take.score >= 40 ? 'Good start. Listen again and copy the rhythm.' : 'Listen slowly and repeat in small chunks.'}</span>
              </p>
              {words && (
                <p className="mt-2 leading-7">
                  {words.map((w, i) => <span key={i} className={w.hit ? 'text-emerald-700 dark:text-emerald-300' : 'rounded bg-amber-100 px-0.5 text-amber-900 dark:bg-amber-400/20 dark:text-amber-200'}>{w.text} </span>)}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">I heard: “{take.transcript || '…nothing clear'}”</p>
            </>
          ) : (
            <p className="text-slate-600 dark:text-slate-300">Recorded ✓ Your browser can't transcribe speech, so there's no score. Use “Model + me” to compare by ear.</p>
          )}
        </div>
      )}

      {rec.error && <p className="text-xs text-amber-700 dark:text-amber-300">{rec.error}</p>}
      {!rec.supported && <p className="text-xs text-slate-500">Recording isn't supported in this browser (try Chrome, Edge or Safari). You can still listen and repeat out loud.</p>}
      {rec.supported && !rec.canRecordAudio && <p className="text-xs text-slate-500">This browser can transcribe but not record audio, so playback of your voice is off.</p>}
      {!tts && <p className="text-xs text-slate-500">Read-aloud isn't supported in this browser, so read the sentence yourself before recording.</p>}

      <div className="flex items-center justify-between border-t border-slate-200 pt-3 dark:border-slate-800">
        <button className="btn-ghost !px-3" onClick={() => go(idx - 1)} disabled={idx === 0 || busy}>← Prev</button>
        <span className="muted text-xs">{Object.keys(takes).length}/{sentences.length} practised</span>
        <button className="btn-ghost !px-3" onClick={() => go(idx + 1)} disabled={idx === sentences.length - 1 || busy}>Next →</button>
      </div>
    </div>
  );
}

/** A card that opens shadowing practice for a piece of model text. */
export function ShadowCard({ text, phrases, title = '🗣️ Shadowing', hint }: { text: string; phrases?: string[]; title?: string; hint?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="card space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="h-section">{title}</h2>
          <p className="muted">{hint || 'Listen to one sentence, repeat it out loud, then hear the model and yourself back to back.'}</p>
        </div>
      </div>
      {open ? (
        <ShadowPractice key={text} text={text} phrases={phrases} onClose={() => setOpen(false)} />
      ) : (
        <button className="btn-soft" onClick={() => setOpen(true)}><Icon name="ear" className="h-4 w-4" /> Start shadowing</button>
      )}
    </section>
  );
}
