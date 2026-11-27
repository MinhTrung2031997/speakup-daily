// Minimal Web Push (RFC 8291 aes128gcm payload encryption + RFC 8292 VAPID) on WebCrypto only,
// so it runs in Deno (Edge Functions) and Node 20+ without the Node `web-push` package.

const enc = new TextEncoder();
const subtle = globalThis.crypto.subtle;

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64url(s: string): Uint8Array {
  const p = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(p);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await subtle.sign('HMAC', k, data));
}

export interface VapidJwk { kty: 'EC'; crv: 'P-256'; d: string; x: string; y: string }

export async function generateVapid(): Promise<VapidJwk> {
  const k = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const j = await subtle.exportKey('jwk', k.privateKey) as JsonWebKey;
  return { kty: 'EC', crv: 'P-256', d: j.d!, x: j.x!, y: j.y! };
}

/** The application server public key (uncompressed point, base64url) the browser subscribes with. */
export function vapidPublicKey(jwk: VapidJwk): string {
  return b64url(concat(new Uint8Array([4]), unb64url(jwk.x), unb64url(jwk.y)));
}

async function vapidAuth(endpoint: string, jwk: VapidJwk, subject: string): Promise<string> {
  const aud = new URL(endpoint).origin;
  const header = b64url(enc.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64url(enc.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject })));
  const key = await subtle.importKey('jwk', { ...jwk, ext: true }, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = new Uint8Array(await subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, enc.encode(`${header}.${claims}`)));
  return `vapid t=${header}.${claims}.${b64url(sig)}, k=${vapidPublicKey(jwk)}`;
}

/** Encrypt one push message for a subscription (single aes128gcm record). */
export async function encryptPayload(p256dh: string, auth: string, payload: Uint8Array): Promise<Uint8Array> {
  const uaPublic = unb64url(p256dh);
  const authSecret = unb64url(auth);
  const as = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPublic = new Uint8Array(await subtle.exportKey('raw', as.publicKey));
  const uaKey = await subtle.importKey('raw', uaPublic, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await subtle.deriveBits({ name: 'ECDH', public: uaKey }, as.privateKey, 256));
  const prkKey = await hmac(authSecret, ecdh);
  const ikm = await hmac(prkKey, concat(enc.encode('WebPush: info\0'), uaPublic, asPublic, new Uint8Array([1])));
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const prk = await hmac(salt, ikm);
  const cek = (await hmac(prk, concat(enc.encode('Content-Encoding: aes128gcm\0'), new Uint8Array([1])))).slice(0, 16);
  const nonce = (await hmac(prk, concat(enc.encode('Content-Encoding: nonce\0'), new Uint8Array([1])))).slice(0, 12);
  const key = await subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ct = new Uint8Array(await subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, concat(payload, new Uint8Array([2]))));
  const header = new Uint8Array(16 + 4 + 1 + asPublic.length);
  header.set(salt, 0);
  new DataView(header.buffer).setUint32(16, 4096);
  header[20] = asPublic.length;
  header.set(asPublic, 21);
  return concat(header, ct);
}

export interface PushTarget { endpoint: string; p256dh: string; auth: string }

/** Send one notification. Returns the push service HTTP status (201 = accepted, 404/410 = subscription gone). */
export async function sendPush(sub: PushTarget, data: unknown, jwk: VapidJwk, subject: string, ttl = 6 * 3600): Promise<{ status: number; text: string }> {
  const body = await encryptPayload(sub.p256dh, sub.auth, enc.encode(JSON.stringify(data)));
  const res = await fetch(sub.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuth(sub.endpoint, jwk, subject),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(ttl),
      Urgency: 'normal',
    },
    body,
  });
  const text = res.ok ? '' : (await res.text().catch(() => '')).slice(0, 300);
  return { status: res.status, text };
}
