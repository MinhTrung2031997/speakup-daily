import { useCallback, useEffect, useRef, useState } from 'react';

/* ---------------- Speech-to-text (Web Speech API) ---------------- */

// Minimal typings for the (still prefixed) Web Speech API.
interface SRAlternative { transcript: string }
interface SRResult { isFinal: boolean; 0: SRAlternative; length: number }
interface SREvent { resultIndex: number; results: { length: number; [i: number]: SRResult } }
interface SRErrorEvent { error: string }
export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SREvent) => void) | null;
  onerror: ((e: SRErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SRCtor = new () => SpeechRecognitionLike;

function getSR(): SRCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: SRCtor; webkitSpeechRecognition?: SRCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export const speechRecognitionSupported = (): boolean => !!getSR();

/** A fresh continuous en-US recogniser with interim results, or null if unsupported. */
export function createRecognition(): SpeechRecognitionLike | null {
  const SR = getSR();
  if (!SR) return null;
  const rec = new SR();
  rec.lang = 'en-US';
  rec.continuous = true;
  rec.interimResults = true;
  return rec;
}

export interface RecognitionHandlers {
  /** Called with final text chunks as they are recognised. */
  onFinal: (text: string) => void;
  /** Called when a recording session ends, with its length in seconds. */
  onSession?: (seconds: number) => void;
}

export function useSpeechRecognition({ onFinal, onSession }: RecognitionHandlers) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRef = useRef(false);
  const startedAt = useRef(0);
  const handlers = useRef({ onFinal, onSession });
  handlers.current = { onFinal, onSession };
  const supported = speechRecognitionSupported();

  const finish = useCallback(() => {
    if (startedAt.current) {
      handlers.current.onSession?.((Date.now() - startedAt.current) / 1000);
      startedAt.current = 0;
    }
    setListening(false);
    setInterim('');
  }, []);

  const start = useCallback(() => {
    const SR = getSR();
    if (!SR) {
      setError("Voice input isn't supported in this browser. Try Chrome, Edge or Safari, or just type your answer.");
      return;
    }
    setError('');
    const rec = new SR();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interimText = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) handlers.current.onFinal(r[0].transcript.trim());
        else interimText += r[0].transcript;
      }
      setInterim(interimText);
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      wantRef.current = false;
      const map: Record<string, string> = {
        'not-allowed': 'Microphone permission was blocked. Allow mic access in your browser settings, or type instead.',
        'service-not-allowed': 'Speech recognition is not allowed here. Try Chrome or Edge, or type instead.',
        network: 'Speech recognition needs an internet connection. Please try again.',
        'audio-capture': 'No microphone was found.',
      };
      setError(map[e.error] || `Voice input error: ${e.error}`);
    };
    rec.onend = () => {
      // Chrome stops after a pause; keep going until the user presses stop.
      if (wantRef.current) {
        try {
          rec.start();
          return;
        } catch {
          /* fall through */
        }
      }
      finish();
    };
    recRef.current = rec;
    wantRef.current = true;
    try {
      rec.start();
      startedAt.current = Date.now();
      setListening(true);
    } catch {
      wantRef.current = false;
      setError('Could not start the microphone. Please try again.');
    }
  }, [finish]);

  const stop = useCallback(() => {
    wantRef.current = false;
    recRef.current?.stop();
  }, []);

  useEffect(() => () => {
    wantRef.current = false;
    recRef.current?.abort();
  }, []);

  return { supported, listening, interim, error, start, stop, toggle: listening ? stop : start };
}

/* ---------------- Text-to-speech (speechSynthesis) ---------------- */

export const ttsSupported = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function useEnglishVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  useEffect(() => {
    if (!ttsSupported()) return;
    const load = () => {
      const all = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith('en'));
      all.sort((a, b) => Number(b.lang === 'en-US') - Number(a.lang === 'en-US') || a.name.localeCompare(b.name));
      setVoices(all);
    };
    load();
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => window.speechSynthesis.removeEventListener('voiceschanged', load);
  }, []);
  return voices;
}

export function pickVoice(voiceURI: string): SpeechSynthesisVoice | undefined {
  if (!ttsSupported()) return undefined;
  const all = window.speechSynthesis.getVoices();
  return all.find((v) => v.voiceURI === voiceURI) || all.find((v) => v.lang === 'en-US') || all.find((v) => v.lang.startsWith('en'));
}

/** Speak one piece of text. Resolves when finished (or cancelled). */
export function speak(text: string, opts: { voiceURI: string; rate: number }): Promise<void> {
  return new Promise((resolve) => {
    if (!ttsSupported()) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(opts.voiceURI);
    if (v) u.voice = v;
    u.lang = v?.lang || 'en-US';
    u.rate = opts.rate;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}
