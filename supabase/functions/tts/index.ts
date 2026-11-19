// SpeakUp Daily text-to-speech: a natural Gemini voice reads a short text (the daily question, example
// sentences). The audio is cached per user in the private `recordings` bucket at
// '<user_id>/tts/<sha256>.wav', so the same text + accent is generated only once.
//
// POST /functions/v1/tts   Authorization: Bearer <user access token>
//   { text: string (<= 600 chars), accent?: 'US' | 'UK' }
// -> 200 { url: string (signed, 1 h), path: string, cached: boolean, model?: string }
// -> 4xx/5xx { error: { kind, message } }
import { createClient } from 'npm:@supabase/supabase-js@2';

const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const PREFERRED = ['gemini-2.5-flash-preview-tts', 'gemini-2.5-flash-tts', 'gemini-2.5-pro-preview-tts'];
const VOICE = { US: 'Puck', UK: 'Aoede' } as const; // friendly, casual prebuilt voices
const OUT_RATE = 16000; // stored WAV: 16 kHz mono 16-bit (~32 KB/s)
const TIMEOUT_MS = 30000;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (status: number, kind: string, message: string) => reply(status, { error: { kind, message } });

let ttsModels: string[] | null = null;
async function models(key: string): Promise<string[]> {
  if (ttsModels) return ttsModels;
  let listed: string[] = [];
  try {
    const res = await fetch(`${GEMINI}/models?pageSize=200`, { headers: { 'x-goog-api-key': key } });
    if (res.ok) {
      const data = await res.json();
      listed = (data?.models || [])
        .filter((m: { supportedGenerationMethods?: string[] }) => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map((m: { name: string }) => m.name.replace(/^models\//, ''))
        .filter((n: string) => /^gemini.*tts/.test(n));
    }
  } catch { /* use the preferred list */ }
  const score = (n: string) => (/flash/.test(n) ? 100 : 0) + (/lite/.test(n) ? 5 : 0) + (/preview/.test(n) ? -2 : 0) + parseFloat(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] || '0');
  const sorted = listed.sort((a, b) => score(b) - score(a));
  ttsModels = [...new Set([...sorted, ...PREFERRED.filter((m) => !listed.length || listed.includes(m))])];
  return ttsModels;
}

function wav(pcm16: Int16Array, rate: number): Uint8Array {
  const out = new Uint8Array(44 + pcm16.length * 2);
  const v = new DataView(out.buffer);
  const s = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  s(0, 'RIFF'); v.setUint32(4, 36 + pcm16.length * 2, true); s(8, 'WAVE'); s(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); s(36, 'data'); v.setUint32(40, pcm16.length * 2, true);
  for (let i = 0; i < pcm16.length; i++) v.setInt16(44 + i * 2, pcm16[i], true);
  return out;
}

/**
 * Clean the clip so it ends softly: Gemini TTS sometimes appends a short burst of loud noise after the
 * speech has ended (heard as a click/hiss at the end). Cut anything after the last pause in the final
 * ~0.8 s that is much louder than the speech or near full scale, trim the trailing silence (keep 150 ms),
 * then fade in 5 ms and fade out 40 ms so there is no click.
 */
export function cleanClip(x: Int16Array, rate: number): Int16Array {
  const blk = Math.max(1, Math.round(rate / 100)); // 10 ms blocks
  const nb = Math.floor(x.length / blk);
  if (nb < 10) return x;
  const rms: number[] = [], peak: number[] = [];
  for (let b = 0; b < nb; b++) {
    let s = 0, p = 0;
    for (let i = b * blk; i < (b + 1) * blk; i++) { const v = x[i]; s += v * v; const a = Math.abs(v); if (a > p) p = a; }
    rms.push(Math.sqrt(s / blk)); peak.push(p);
  }
  const QUIET = 200;
  const voiced = rms.filter((r) => r > QUIET).sort((a, b) => a - b);
  const median = voiced.length ? voiced[Math.floor(voiced.length / 2)] : 0;
  let end = nb; // exclusive, in blocks
  // A tail burst: after a pause of >= 80 ms, within the last 800 ms, and loud (clipping or >2.5x the median speech level).
  const tailFrom = Math.max(0, nb - 80);
  for (let b = nb - 1, quiet = 0; b >= tailFrom; b--) {
    quiet = rms[b] < QUIET ? quiet + 1 : 0;
    if (quiet >= 8) {
      const after = rms.slice(b + quiet, nb), pk = Math.max(0, ...peak.slice(b + quiet, nb));
      const loud = after.length && (pk >= 29000 || Math.max(...after) > 2.5 * Math.max(median, 1500));
      if (loud) end = b + quiet;
      break;
    }
  }
  // Trim trailing silence (keep 150 ms after the last voiced block).
  let last = end - 1;
  while (last > 0 && rms[last] < QUIET) last--;
  end = Math.min(end, last + 1 + 15);
  const out = x.slice(0, Math.min(x.length, end * blk));
  const fin = Math.min(out.length, Math.round(rate * 0.005)), fout = Math.min(out.length, Math.round(rate * 0.04));
  for (let i = 0; i < fin; i++) out[i] = Math.round(out[i] * (i / fin));
  for (let i = 0; i < fout; i++) { const k = out.length - 1 - i; out[k] = Math.round(out[k] * (i / fout)); }
  return out;
}

/** Gemini returns 16-bit little-endian PCM (raw L16 or a WAV): read only the real samples, resample to 16 kHz, clean, wrap as WAV. */
export function toWav(b64: string, mime: string): Uint8Array {
  let raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  let inRate = Number(mime.match(/rate=(\d+)/)?.[1] || 24000);
  let channels = 1;
  if (raw.length > 44 && String.fromCharCode(...raw.subarray(0, 4)) === 'RIFF') {
    // WAV: walk the chunks; use the fmt values and ONLY the bytes the 'data' chunk declares
    // (anything after it, e.g. a LIST chunk, is not audio and plays as loud noise).
    const h = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
    let o = 12, data: Uint8Array | null = null;
    while (o + 8 <= raw.length) {
      const id = String.fromCharCode(...raw.subarray(o, o + 4));
      const size = h.getUint32(o + 4, true);
      if (id === 'fmt ') { channels = h.getUint16(o + 10, true) || 1; inRate = h.getUint32(o + 12, true) || inRate; }
      if (id === 'data') {
        const avail = raw.length - (o + 8);
        data = raw.subarray(o + 8, o + 8 + (size > 0 && size <= avail ? size : avail));
        break;
      }
      o += 8 + size + (size % 2); // chunks are word-aligned
    }
    raw = data || raw.subarray(44);
  }
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  const n = Math.floor(raw.byteLength / (2 * channels)); // whole frames only (an odd trailing byte is dropped)
  const src = new Int16Array(n);
  for (let i = 0; i < n; i++) src[i] = dv.getInt16(i * 2 * channels, true);
  if (inRate <= OUT_RATE) return wav(cleanClip(src, inRate), inRate);
  const m = Math.floor(((n - 1) * OUT_RATE) / inRate);
  const dst = new Int16Array(m);
  for (let i = 0; i < m; i++) {
    const x = (i * inRate) / OUT_RATE, j = Math.floor(x), f = x - j;
    dst[i] = Math.round(src[j] * (1 - f) + src[Math.min(j + 1, n - 1)] * f);
  }
  return wav(cleanClip(dst, OUT_RATE), OUT_RATE);
}

async function sha(t: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return fail(405, 'bad_request', 'Use POST.');
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return fail(401, 'auth', 'Please sign in again.');
  // A client acting as the user: storage RLS keeps reads/writes inside the user's own folder.
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u?.user) return fail(401, 'auth', 'Your session expired. Please sign in again.');
  const key = (Deno.env.get('GEMINI_API_KEY') || '').trim();
  if (!key) return fail(503, 'nokey', 'AI key not set up yet.');

  let body: { text?: unknown; accent?: unknown };
  try { body = await req.json(); } catch { return fail(400, 'bad_request', 'Invalid JSON body.'); }
  const text = typeof body.text === 'string' ? body.text.replace(/\s+/g, ' ').trim() : '';
  if (!text || text.length > 800) return fail(400, 'bad_request', 'Send 1 to 800 characters of text.');
  const accent = body.accent === 'UK' ? 'UK' : 'US';
  const voice = VOICE[accent];
  const path = `${u.user.id}/tts/${await sha(`v6|${accent}|${voice}|${text}`)}.wav`;

  const bucket = sb.storage.from('recordings');
  const hit = await bucket.createSignedUrl(path, 3600);
  if (!hit.error && hit.data?.signedUrl) return reply(200, { url: hit.data.signedUrl, path, cached: true });

  // Short style cue only (a long instruction gets read out loud).
  // A bracketed style tag (tested: a written instruction like "Say casually: ..." gets read out loud).
  const tag = accent === 'UK' ? 'casual, friendly, Southern British English (London) accent, British pronunciation' : 'casual, friendly, General American accent';
  const prompt = `[${tag}] ${text}`;
  let lastErr = 'No TTS model answered.';
  for (const model of (await models(key)).slice(0, 3)) {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
      const res = await fetch(`${GEMINI}/models/${model}:generateContent`, {
        method: 'POST', signal: ctl.signal,
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } } },
        }),
      }).finally(() => clearTimeout(timer));
      const data = await res.json().catch(() => null);
      if (!res.ok) { lastErr = `${model}: ${res.status} ${data?.error?.message || ''}`.slice(0, 300); continue; }
      const part = data?.candidates?.[0]?.content?.parts?.find((p: { inlineData?: unknown }) => p.inlineData)?.inlineData;
      if (!part?.data) { lastErr = `${model}: no audio`; continue; }
      const audio = toWav(part.data, part.mimeType || '');
      const up = await bucket.upload(path, new Blob([audio], { type: 'audio/wav' }), { contentType: 'audio/wav', upsert: true });
      if (up.error) {
        // Could not cache: still play it (data URL).
        let bin = '';
        for (let i = 0; i < audio.length; i += 0x8000) bin += String.fromCharCode(...audio.subarray(i, i + 0x8000));
        return reply(200, { url: `data:audio/wav;base64,${btoa(bin)}`, path: '', cached: false, model });
      }
      const s = await bucket.createSignedUrl(path, 3600);
      if (s.error) return fail(500, 'server', s.error.message);
      return reply(200, { url: s.data.signedUrl, path, cached: false, model });
    } catch (e) {
      lastErr = `${model}: ${String(e).slice(0, 200)}`;
    }
  }
  return fail(502, 'server', lastErr);
});
