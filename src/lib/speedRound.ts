// Reply speed meter: the browser side of a round — mic, question playback, one answer's recording with live
// start / silence detection, then the measurements from the waveform (+ Gemini filler count).
import { audioRecordingSupported } from './recorder';
import { decodePcm, measurePauses, speechOnset, wavBase64, type AudioClip } from './audio';
import { naturalSpeechUrl } from './tts';
import { accentVoice, createRecognition, preferredAccent, speakWith, stopSpeaking } from './speech';
import { countFillers } from './fluency';
import { quickFireFillers } from './ai';
import type { GeminiConfig } from './gemini';
import { fillersPerMinute, MAX_ANSWER_S, NO_SPEECH_STOP_S, TRAILING_SILENCE_S } from './speed';
import type { QuickFireAnswer } from './types';

const RATE = 16000;

export interface Mic {
  stream: MediaStream;
  ctx: AudioContext;
  analyser: AnalyserNode;
  /** Room noise level (RMS), measured by calibrate() on the Get ready screen. */
  floor: number;
  close: () => void;
}

export async function openMic(): Promise<Mic> {
  if (!audioRecordingSupported()) throw new Error('This browser cannot record audio. Try Chrome on a phone or computer.');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  ctx.createMediaStreamSource(stream).connect(analyser);
  await ctx.resume().catch(() => undefined);
  return { stream, ctx, analyser, floor: 0.004, close: () => { stream.getTracks().forEach((t) => t.stop()); ctx.close().catch(() => undefined); } };
}

function rmsNow(mic: Mic, buf: Float32Array<ArrayBuffer>): number {
  mic.analyser.getFloatTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
  return Math.sqrt(sum / buf.length);
}

/** Measure the room's noise floor (20th percentile of 50 ms levels) while the questions load. */
export async function calibrate(mic: Mic, ms = 1500): Promise<void> {
  const buf = new Float32Array(mic.analyser.fftSize);
  const vals: number[] = [];
  const end = performance.now() + ms;
  while (performance.now() < end) {
    vals.push(rmsNow(mic, buf));
    await new Promise((r) => setTimeout(r, 50));
  }
  vals.sort((a, b) => a - b);
  if (vals.length) mic.floor = Math.min(0.05, vals[Math.floor(vals.length * 0.2)]);
}

/**
 * Pre-warm: natural-voice audio for each question, fetched into memory, 3 at a time (the TTS model has a
 * small per-minute quota; 8 parallel calls hit 429 -> 502). A failed one is retried once (not when the quota is
 * used up), then null = use the browser voice (502, demo, offline). Generated clips are cached per user, so
 * questions that were asked before always load.
 */
export async function prepareVoices(texts: string[], onReady: (done: number) => void): Promise<(string | null)[]> {
  let done = 0;
  const accent = preferredAccent();
  const out: (string | null)[] = texts.map(() => null);
  const one = async (t: string): Promise<string | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const url = await Promise.race([naturalSpeechUrl(t, accent), new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 30000))]);
        const blob = await (await fetch(url)).blob();
        if (!blob.size) throw new Error('empty');
        return URL.createObjectURL(blob);
      } catch (e) {
        const msg = (e as Error).message || '';
        // Demo / signed out / the TTS quota for this minute is used up: no point retrying now.
        if (msg === 'demo' || msg === 'signed out' || /quota|429/i.test(msg)) return null;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    return null;
  };
  let next = 0;
  const worker = async () => {
    while (next < texts.length) {
      const i = next++;
      out[i] = await one(texts[i]);
      onReady(++done);
    }
  };
  await Promise.all([worker(), worker(), worker()]);
  return out;
}

let playing: HTMLAudioElement | null = null;
export function stopQuestion() {
  if (playing) { playing.pause(); playing = null; }
  stopSpeaking();
}

/** Play one question; resolves when the audio has ended. */
export async function playQuestion(text: string, url: string | null): Promise<'natural' | 'browser'> {
  stopQuestion();
  if (url) {
    try {
      const a = new Audio(url);
      playing = a;
      const ended = new Promise<void>((r) => { a.onended = () => r(); a.onpause = () => r(); a.onerror = () => r(); });
      await a.play();
      await ended;
      playing = null;
      return 'natural';
    } catch { /* fall back */ }
  }
  const accent = preferredAccent();
  await speakWith(text, { voice: accentVoice(accent, ''), rate: 1, lang: accent === 'UK' ? 'en-GB' : 'en-US' });
  return 'browser';
}

export interface LiveTick { elapsed: number; level: number; spoke: boolean; missed: boolean }
export interface RawAnswer { clip: AudioClip | null; transcript: string; liveOnset: number | null; elapsed: number }

function pickMime(): string {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return types.find((t) => window.MediaRecorder.isTypeSupported?.(t)) || '';
}

/**
 * Record one answer, starting right now (call it the moment the question audio ends).
 * Ends at MAX_ANSWER_S, after TRAILING_SILENCE_S of silence once speech started, or after NO_SPEECH_STOP_S with no speech.
 * `cancel` stops early (e.g. leaving the page).
 */
export function recordAnswer(mic: Mic, limit: number, onTick: (t: LiveTick) => void, signal: { cancelled: boolean }): Promise<RawAnswer> {
  return new Promise((resolve) => {
    const mime = pickMime();
    const mr = new MediaRecorder(mic.stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24000 });
    const chunks: Blob[] = [];
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const t0 = performance.now();
    mr.start(250);

    // Chrome's recogniser for a transcript hint and the fallback filler count.
    const finals: string[] = [];
    let interim = '';
    const rec = createRecognition();
    let recEnded: Promise<void> = Promise.resolve();
    if (rec) {
      recEnded = new Promise((r) => { rec.onend = () => r(); });
      rec.onresult = (e) => {
        interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const res = e.results[i];
          if (res.isFinal) finals.push(res[0].transcript.trim()); else interim += res[0].transcript;
        }
      };
      rec.onerror = () => undefined;
      try { rec.start(); } catch { /* already running */ }
    }

    const buf = new Float32Array(mic.analyser.fftSize);
    // Speech = clearly above the room noise measured on the Get ready screen.
    const thr = Math.max(0.012, mic.floor * 3.5);
    let loudRun = 0;
    let quietSince = 0;
    let onset: number | null = null;
    let level = 0;
    const timer = window.setInterval(() => {
      const elapsed = (performance.now() - t0) / 1000;
      const rms = rmsNow(mic, buf);
      level = level * 0.6 + rms * 0.4;
      if (rms > thr) {
        loudRun++;
        quietSince = 0;
        if (onset == null && loudRun >= 3) onset = Math.max(0, elapsed - 0.1);
      } else {
        loudRun = 0;
        if (!quietSince) quietSince = elapsed;
      }
      onTick({ elapsed, level: Math.min(1, level * 12), spoke: onset != null, missed: onset == null && elapsed > limit });
      const silentFor = quietSince ? elapsed - quietSince : 0;
      const stop = signal.cancelled || elapsed >= MAX_ANSWER_S || (onset != null && silentFor >= TRAILING_SILENCE_S) || (onset == null && elapsed >= NO_SPEECH_STOP_S);
      if (!stop) return;
      window.clearInterval(timer);
      const seconds = Math.round(elapsed * 10) / 10;
      mr.onstop = async () => {
        if (rec) { try { rec.stop(); } catch { /* ignore */ } await Promise.race([recEnded, new Promise((r) => setTimeout(r, 900))]); }
        const type = (mr.mimeType || 'audio/webm').split(';')[0];
        const blob = new Blob(chunks, { type });
        resolve({ clip: blob.size > 500 ? { blob, mimeType: type, seconds } : null, transcript: [...finals, interim.trim()].filter(Boolean).join(' ').trim(), liveOnset: onset, elapsed: seconds });
      };
      mr.stop();
    }, 50);
  });
}

/** Measurements for one answer: waveform onset + longest pause, fillers from Gemini (Chrome's count as fallback). */
export async function analyzeAnswer(cfg: GeminiConfig, q: { q: string; level: 'easy' | 'open' }, raw: RawAnswer, limit: number): Promise<QuickFireAnswer> {
  let start: number | null = raw.liveOnset;
  let longestPause = 0;
  let speechSeconds = 0;
  let pcm: Float32Array | null = null;
  if (raw.clip) {
    try {
      pcm = await decodePcm(raw.clip.blob, RATE);
      start = speechOnset(pcm, RATE);
      if (start != null) {
        const m = measurePauses(pcm.subarray(Math.floor(start * RATE)), RATE, 0.3);
        longestPause = m.longestPause;
        speechSeconds = m.speechSeconds;
      }
    } catch { /* keep the live estimate */ }
  }
  if (start != null && !speechSeconds) speechSeconds = Math.max(0, raw.elapsed - start - TRAILING_SILENCE_S);
  const chrome = countFillers(raw.transcript).total;
  let fillers = chrome;
  let fillerSource: 'gemini' | 'chrome' = 'chrome';
  let transcript = raw.transcript;
  if (pcm && start != null) {
    try {
      const from = Math.max(0, Math.floor((start - 0.2) * RATE));
      const slice = pcm.subarray(from);
      const g = await quickFireFillers(cfg, { mimeType: 'audio/wav', data: wavBase64(slice, RATE), seconds: slice.length / RATE }, { question: q.q, transcript: raw.transcript });
      if (g.transcript.trim() || !raw.transcript) {
        fillers = g.total;
        fillerSource = 'gemini';
        transcript = g.transcript.trim() || raw.transcript;
      }
    } catch { /* Chrome's count */ }
  }
  const startR = start == null ? null : Math.round(start * 10) / 10;
  return {
    q: q.q, level: q.level,
    start: startR,
    missed: startR == null || startR > limit,
    seconds: raw.clip?.seconds || raw.elapsed,
    speechSeconds: Math.round(speechSeconds * 10) / 10,
    fillers,
    fillersPerMin: fillersPerMinute(fillers, speechSeconds),
    fillerSource,
    longestPause,
    transcript,
  };
}
