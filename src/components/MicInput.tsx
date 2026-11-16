import { useRef } from 'react';
import { useSpeechRecognition } from '../lib/speech';
import { useStore } from '../lib/store';
import Icon from './Icon';

interface Props {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
  /** Chat mode: Enter sends, shows a send button. */
  onSend?: () => void;
  sendDisabled?: boolean;
}

/** Text box with a mic button that appends speech-to-text into the box. */
export default function MicInput({ value, onChange, placeholder, rows = 4, disabled, onSend, sendDisabled }: Props) {
  const { addSpeaking } = useStore();
  const valueRef = useRef(value);
  valueRef.current = value;
  const sr = useSpeechRecognition({
    onFinal: (t) => {
      if (!t) return;
      const cur = valueRef.current;
      const next = cur && !/\s$/.test(cur) ? `${cur} ${t}` : cur + t;
      valueRef.current = next;
      onChange(next);
    },
    onSession: (sec) => addSpeaking(sec),
  });

  return (
    <div>
      <div className={`relative rounded-2xl border bg-white transition dark:bg-slate-950 ${sr.listening ? 'border-rose-400 ring-2 ring-rose-400/20' : 'border-slate-300 focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 dark:border-slate-700'}`}>
        <textarea
          className="block w-full resize-y rounded-2xl bg-transparent px-3 py-3 pr-14 text-[15px] leading-relaxed outline-none placeholder:text-slate-400"
          rows={rows}
          value={value + (sr.interim ? (value ? ' ' : '') + sr.interim : '')}
          onChange={(e) => !sr.listening && onChange(e.target.value)}
          placeholder={sr.listening ? 'Listening… speak now' : placeholder}
          disabled={disabled}
          readOnly={sr.listening}
          onKeyDown={(e) => {
            if (onSend && e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (!sendDisabled) onSend();
            }
          }}
        />
        <div className="absolute bottom-2 right-2 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={sr.toggle}
            disabled={disabled}
            title={sr.supported ? (sr.listening ? 'Stop recording' : 'Answer by voice') : 'Voice input not supported in this browser'}
            className={`flex h-10 w-10 items-center justify-center rounded-full transition ${sr.listening ? 'animate-pulse bg-rose-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:text-slate-950'} ${!sr.supported ? 'opacity-50' : ''}`}
          >
            <Icon name={sr.listening ? 'stop' : 'mic'} />
          </button>
          {onSend && (
            <button type="button" onClick={() => { sr.stop(); onSend(); }} disabled={sendDisabled} title="Send" className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-white transition hover:bg-slate-700 disabled:opacity-40 dark:bg-slate-200 dark:text-slate-900">
              <Icon name="send" className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
      {sr.listening && <p className="mt-1.5 text-xs font-medium text-rose-600 dark:text-rose-300">● Recording… press stop when you finish.</p>}
      {sr.error && <p className="mt-1.5 text-xs text-amber-700 dark:text-amber-300">{sr.error}</p>}
      {!sr.supported && !sr.error && <p className="mt-1.5 text-xs text-slate-500">Voice input works in Chrome, Edge and Safari. You can always type.</p>}
    </div>
  );
}
