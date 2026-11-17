import { useCallback, useEffect, useRef } from "react";
import { audioRecordingSupported } from './recorder';

/* ---------------- Audio clips for the pronunciation check ---------------- */

export interface AudioClip {
  blob: Blob;
  mimeType: string;
  seconds: number;
}

export const MAX_CHECK_SECONDS = 90;
const TARGET_RATE = 16000;
const MAX_RAW_BYTES = 7 * 1024 * 1024; // the `ai` Edge Function accepts ~8 MB of base64 audio

function pickMime(): string {
  const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  return types.find((t) => window.MediaRecorder.isTypeSupported?.(t)) || '';
}

/**
 * Records the mic with MediaRecorder alongside speech recognition (used by MicInput).
 * Fails silently: if the mic or MediaRecorder isn't available, there is simply no clip.
 */
export function useClipRecorder(enabled: boolean) {
  const mrRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const pending = useRef<Promise<void> | null>(null);

  const cleanup = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const start = useCallback(() => {
    if (!enabled || !audioRecordingSupported() || mrRef.current) return;
    pending.current = (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const mime = pickMime();
        // Opus ~24 kbps: clear speech, ~3 KB/s, so a 45s answer is ~140 KB.
        const mr = new MediaRecorder(stream, { ...(mime ? { mimeType: mime } : {}), audioBitsPerSecond: 24000 });
        chunks.current = [];
        mr.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
        mrRef.current = mr;
        mr.start();
        startedAt.current = Date.now();
      } catch {
        cleanup();
        mrRef.current = null;
      }
    })();
  }, [enabled]);

  const stop = useCallback(async (): Promise<AudioClip | null> => {
    await pending.current;
    const mr = mrRef.current;
    mrRef.current = null;
    if (!mr || mr.state === 'inactive') { cleanup(); return null; }
    const seconds = (Date.now() - startedAt.current) / 1000;
    return new Promise((resolve) => {
      mr.onstop = () => {
        cleanup();
        const type = (mr.mimeType || 'audio/webm').split(';')[0];
        const blob = new Blob(chunks.current, { type });
        chunks.current = [];
        resolve(blob.size > 1000 && seconds > 0.8 ? { blob, mimeType: type, seconds } : null);
      };
      mr.stop();
    });
  }, []);

  useEffect(() => () => {
    const mr = mrRef.current;
    if (mr && mr.state !== 'inactive') { mr.onstop = null; mr.stop(); }
    mrRef.current = null;
    cleanup();
  }, []);

  return { start, stop };
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function wavFromPcm(pcm: Float32Array, rate: number): ArrayBuffer {
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const w = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 0x7fff, true);
  return buf;
}

export interface PauseStats {
  /** Silent gaps longer than 1.5 s between the first and last sound. */
  pauses: number;
  longestPause: number;
  /** Seconds from the first to the last sound. */
  speechSeconds: number;
}

/**
 * Measure long pauses straight from the waveform (20 ms frames, adaptive loudness threshold).
 * More reliable than asking the model to time silences.
 */
export function measurePauses(pcm: Float32Array, rate: number, minPause = 1.5): PauseStats {
  const frame = Math.max(1, Math.round(rate * 0.02));
  const n = Math.floor(pcm.length / frame);
  if (!n) return { pauses: 0, longestPause: 0, speechSeconds: 0 };
  const rms = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    let sum = 0;
    for (let i = f * frame; i < (f + 1) * frame; i++) sum += pcm[i] * pcm[i];
    rms[f] = Math.sqrt(sum / frame);
  }
  const sorted = Array.from(rms).sort((a, b) => a - b);
  const floor = sorted[Math.floor(n * 0.1)];
  const peak = sorted[Math.floor(n * 0.98)];
  const thr = Math.max(0.004, floor * 3, peak * 0.06);
  const loud = Array.from(rms, (v) => v > thr);
  const first = loud.indexOf(true);
  const last = loud.lastIndexOf(true);
  if (first < 0) return { pauses: 0, longestPause: 0, speechSeconds: 0 };
  let pauses = 0, longest = 0, run = 0;
  for (let f = first; f <= last; f++) {
    if (loud[f]) {
      const sec = (run * frame) / rate;
      if (sec > minPause) { pauses++; longest = Math.max(longest, sec); }
      run = 0;
    } else run++;
  }
  return { pauses, longestPause: Math.round(longest * 10) / 10, speechSeconds: Math.round((((last - first + 1) * frame) / rate) * 10) / 10 };
}

/**
 * Turn one or more recorded clips into one audio payload for Gemini: 16 kHz mono WAV
 * (widely supported, ~32 KB/s), at most MAX_CHECK_SECONDS long. If the browser can't decode
 * the recording, send the first clip as recorded (webm/ogg/mp4) when it is small enough.
 */
export type PreparedAudio = { mimeType: string; data: string; seconds: number; measured?: PauseStats };

export async function prepareAudio(clips: AudioClip[]): Promise<PreparedAudio | null> {
  if (!clips.length) return null;
  try {
    const Ctx = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    const parts: Float32Array[] = [];
    let total = 0;
    const max = MAX_CHECK_SECONDS * TARGET_RATE;
    for (const c of clips) {
      if (total >= max) break;
      const decoder = new Ctx(1, 1, TARGET_RATE);
      const decoded = await decoder.decodeAudioData(await c.blob.arrayBuffer());
      const len = Math.ceil(decoded.duration * TARGET_RATE);
      const off = new Ctx(1, len, TARGET_RATE);
      const src = off.createBufferSource();
      src.buffer = decoded;
      src.connect(off.destination);
      src.start();
      const out = (await off.startRendering()).getChannelData(0);
      const take = out.subarray(0, Math.min(out.length, max - total));
      parts.push(take);
      total += take.length;
    }
    const pcm = new Float32Array(total);
    let o = 0;
    for (const p of parts) { pcm.set(p, o); o += p.length; }
    if (total < TARGET_RATE * 0.5) return null;
    // Pauses are measured per clip (the gap between two separate recordings is not a pause).
    const per = parts.map((p) => measurePauses(p, TARGET_RATE));
    const measured: PauseStats = {
      pauses: per.reduce((a, m) => a + m.pauses, 0),
      longestPause: Math.max(0, ...per.map((m) => m.longestPause)),
      speechSeconds: Math.round(per.reduce((a, m) => a + m.speechSeconds, 0) * 10) / 10,
    };
    return { mimeType: 'audio/wav', data: toBase64(wavFromPcm(pcm, TARGET_RATE)), seconds: Math.round((total / TARGET_RATE) * 10) / 10, measured };
  } catch {
    const c = clips[0];
    if (c.blob.size > MAX_RAW_BYTES) return null;
    return { mimeType: c.mimeType, data: toBase64(await c.blob.arrayBuffer()), seconds: Math.min(MAX_CHECK_SECONDS, Math.round(c.seconds)) };
  }
}

export async function clipFromUrl(url: string, seconds: number): Promise<AudioClip | null> {
  try {
    const blob = await (await fetch(url)).blob();
    return blob.size ? { blob, mimeType: (blob.type || 'audio/webm').split(';')[0], seconds } : null;
  } catch {
    return null;
  }
}
