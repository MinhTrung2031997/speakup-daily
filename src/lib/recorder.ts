import { useCallback, useEffect, useRef, useState } from 'react';
import { createRecognition, speechRecognitionSupported, type SpeechRecognitionLike } from './speech';

/* ---------------- Audio recording (MediaRecorder) + live transcript ---------------- */

export interface Recording {
  /** Object URL of the recorded audio ('' if the browser can't record audio). Revoke it when done. */
  url: string;
  /** What speech recognition heard ('' if unavailable). */
  transcript: string;
  seconds: number;
}

export const audioRecordingSupported = (): boolean =>
  typeof window !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== 'undefined';

function pickMime(): string {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return types.find((t) => window.MediaRecorder.isTypeSupported?.(t)) || '';
}

const MIC_ERRORS: Record<string, string> = {
  NotAllowedError: 'Microphone permission was blocked. Allow mic access in your browser settings to record yourself.',
  NotFoundError: 'No microphone was found.',
  NotReadableError: 'Your microphone is being used by another app.',
};

/**
 * Records the mic with MediaRecorder and, where supported, runs speech recognition at the
 * same time so we get both a playable recording and a transcript.
 */
export function useRecorder() {
  const [recording, setRecording] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');
  const mrRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const chunks = useRef<Blob[]>([]);
  const finals = useRef<string[]>([]);
  const startedAt = useRef(0);
  const wantRec = useRef(false);

  const canRecordAudio = audioRecordingSupported();
  const canTranscribe = speechRecognitionSupported();
  const supported = canRecordAudio || canTranscribe;

  const cleanupStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const start = useCallback(async (): Promise<boolean> => {
    if (mrRef.current || recRef.current) return false;
    setError('');
    setInterim('');
    chunks.current = [];
    finals.current = [];

    if (canRecordAudio) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const mime = pickMime();
        // Opus ~24 kbps: clear speech, ~3 KB/s, so a 45s answer is ~140 KB.
        const mr = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24000 });
        mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        mrRef.current = mr;
        mr.start();
      } catch (e) {
        cleanupStream();
        mrRef.current = null;
        const name = (e as { name?: string })?.name || '';
        setError(MIC_ERRORS[name] || 'Could not start the microphone. Please try again.');
        return false;
      }
    }

    const rec = createRecognition();
    if (rec) {
      rec.onresult = (e) => {
        let interimText = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (r.isFinal) finals.current.push(r[0].transcript.trim());
          else interimText += r[0].transcript;
        }
        setInterim(interimText);
      };
      rec.onerror = (e) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        // Transcript is a bonus here; the audio recording still works without it.
        if (!mrRef.current) setError(e.error === 'not-allowed' ? MIC_ERRORS.NotAllowedError : `Voice input error: ${e.error}`);
      };
      rec.onend = () => {
        if (wantRec.current) {
          try {
            rec.start();
            return;
          } catch {
            /* fall through */
          }
        }
        recRef.current = null;
      };
      wantRec.current = true;
      recRef.current = rec;
      try {
        rec.start();
      } catch {
        wantRec.current = false;
        recRef.current = null;
      }
    }

    if (!mrRef.current && !recRef.current) {
      setError("Recording isn't supported in this browser. Try Chrome, Edge or Safari.");
      return false;
    }
    startedAt.current = Date.now();
    setRecording(true);
    return true;
  }, [canRecordAudio]);

  const stop = useCallback((): Promise<Recording | null> => {
    if (!mrRef.current && !recRef.current) return Promise.resolve(null);
    const seconds = (Date.now() - startedAt.current) / 1000;
    wantRec.current = false;
    const rec = recRef.current;
    const mr = mrRef.current;
    mrRef.current = null;
    setRecording(false);

    // Wait for the recogniser's last final result (it arrives just before onend).
    const transcriptP = new Promise<string>((resolve) => {
      if (!rec) return resolve('');
      const done = () => resolve([...finals.current].join(' ').trim());
      const t = setTimeout(done, 1500);
      rec.onend = () => {
        clearTimeout(t);
        recRef.current = null;
        done();
      };
      try {
        rec.stop();
      } catch {
        clearTimeout(t);
        done();
      }
    });
    const audioP = new Promise<string>((resolve) => {
      if (!mr || mr.state === 'inactive') {
        cleanupStream();
        return resolve('');
      }
      mr.onstop = () => {
        cleanupStream();
        const blob = new Blob(chunks.current, { type: mr.mimeType || 'audio/webm' });
        chunks.current = [];
        resolve(blob.size ? URL.createObjectURL(blob) : '');
      };
      mr.stop();
    });
    return Promise.all([audioP, transcriptP]).then(([url, transcript]) => {
      setInterim('');
      return { url, transcript, seconds };
    });
  }, []);

  // Abort everything if the component goes away mid-recording.
  useEffect(() => () => {
    wantRec.current = false;
    try {
      recRef.current?.abort();
    } catch {
      /* ignore */
    }
    const mr = mrRef.current;
    if (mr && mr.state !== 'inactive') {
      mr.onstop = null;
      mr.stop();
    }
    mrRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
  }, []);

  return { supported, canRecordAudio, canTranscribe, recording, interim, error, start, stop };
}
