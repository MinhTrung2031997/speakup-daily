// His turn in a voice conversation. Text mode: the usual mic + text box. Voice-only mode: the mic starts by
// itself when the partner finishes, with a 5-second start timer; the turn is sent after a short silence or on "Send".
import { useEffect, useRef, useState } from 'react';
import { useSpeechRecognition } from '../../lib/speech';
import { useStore } from '../../lib/store';
import { START_SECONDS } from '../../lib/partner';
import MicInput from '../MicInput';
import Icon from '../Icon';

const SILENCE_MS = 3000;

interface Props {
  voiceOnly: boolean;
  /** Bump to start his turn (voice-only: auto-start the mic and the 5-second timer). 0 = not armed. */
  arm: number;
  /** Voice-only: run the 5-second timer on this arm (false after the nudges ran out: he taps the mic himself). */
  timed: boolean;
  disabled: boolean;
  onSubmit: (text: string) => void;
  onMiss: () => void;
}

export default function TurnMic({ voiceOnly, arm, timed, disabled, onSubmit, onMiss }: Props) {
  const [text, setText] = useState('');
  if (!voiceOnly) {
    const send = () => { const t = text.trim(); if (t && !disabled) { setText(''); onSubmit(t); } };
    return <MicInput value={text} onChange={setText} onSend={send} sendDisabled={!text.trim() || disabled} rows={2} placeholder="Reply by voice or text… (Enter to send)" />;
  }
  return <VoiceOnlyMic arm={arm} timed={timed} disabled={disabled} onSubmit={onSubmit} onMiss={onMiss} />;
}

function VoiceOnlyMic({ arm, timed, disabled, onSubmit, onMiss }: Omit<Props, 'voiceOnly'>) {
  const { addSpeaking } = useStore();
  const [text, setText] = useState('');
  const textRef = useRef('');
  const [deadline, setDeadline] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const lastHeard = useRef(0);
  const sending = useRef(false);
  const sr = useSpeechRecognition({
    onFinal: (t) => {
      if (!t) return;
      textRef.current = textRef.current ? `${textRef.current} ${t}` : t;
      setText(textRef.current);
      lastHeard.current = Date.now();
    },
    onSession: (sec) => addSpeaking(sec),
  });
  const heard = !!(text || sr.interim);
  useEffect(() => { if (sr.interim) lastHeard.current = Date.now(); }, [sr.interim]);

  const cbs = useRef({ onSubmit, onMiss });
  cbs.current = { onSubmit, onMiss };

  // A new turn: start listening (and the 5-second timer).
  useEffect(() => {
    if (!arm || disabled) return;
    textRef.current = ''; setText(''); sending.current = false; lastHeard.current = 0;
    sr.start();
    setNow(Date.now());
    setDeadline(timed ? Date.now() + START_SECONDS * 1000 : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arm]);

  useEffect(() => {
    if (!sr.listening && !deadline) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [sr.listening, deadline]);

  const send = () => {
    if (sending.current) return;
    const t = textRef.current.trim();
    sr.stop();
    setDeadline(null);
    if (!t) return;
    sending.current = true;
    textRef.current = ''; setText('');
    cbs.current.onSubmit(t);
  };

  // He started speaking: the start timer is done. Missed it: stop and let the partner nudge him.
  useEffect(() => {
    if (!deadline) return;
    if (heard) { setDeadline(null); return; }
    if (now >= deadline) { setDeadline(null); sr.stop(); cbs.current.onMiss(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now, heard, deadline]);

  // After he has spoken, a few seconds of silence ends his turn.
  useEffect(() => {
    if (sr.listening && text && lastHeard.current && now - lastHeard.current > SILENCE_MS) send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now]);

  const left = deadline ? Math.min(START_SECONDS, Math.max(0, Math.ceil((deadline - now) / 1000))) : 0;
  const toggle = () => {
    if (sr.listening) { send(); return; }
    textRef.current = ''; setText(''); sending.current = false; lastHeard.current = 0;
    sr.start();
  };
  return (
    <div className="flex flex-col items-center gap-2 py-2" data-testid="voice-turn">
      <button type="button" onClick={toggle} disabled={disabled}
        title={sr.listening ? 'Stop recording' : 'Answer by voice'}
        className={`relative flex h-16 w-16 items-center justify-center rounded-full text-white shadow-lg transition disabled:opacity-50 ${sr.listening ? 'bg-rose-500' : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-500'}`}>
        <Icon name={sr.listening ? 'stop' : 'mic'} className="h-7 w-7" />
        {deadline && <span className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-amber-400 text-sm font-bold text-slate-900" data-testid="start-timer">{left}</span>}
      </button>
      <p className="min-h-[1.25rem] text-center text-sm text-slate-500" aria-live="polite">
        {disabled ? 'Listen…' : deadline ? `Start speaking in ${left}s` : sr.listening ? (heard ? 'Listening… (stops after a short pause)' : 'Listening… go ahead') : 'Tap the mic when you are ready'}
      </p>
      {(text || sr.interim) && <p className="max-w-md text-center text-sm italic text-slate-600 dark:text-slate-300" data-testid="voice-transcript">“{text}{sr.interim ? ` ${sr.interim}` : ''}”</p>}
      {sr.listening && text && <button type="button" className="btn-soft !py-1 text-xs" onClick={send} data-testid="turn-send">Send now</button>}
      {sr.error && <p className="text-xs text-rose-600">{sr.error}</p>}
    </div>
  );
}
