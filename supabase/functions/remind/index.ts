// SpeakUp Daily reminders: Web Push for Today's plan.
//
// GET  /functions/v1/remind                          -> { publicKey }   (VAPID application server key, public)
// POST /functions/v1/remind  x-cron-secret: <vault>   -> cron run (pg_cron every 15 min): sends the main reminder once the
//      user's local reminder time has passed and the evening nudge (only if the daily question isn't done), each at most
//      once per local day (push_log unique index), never after the plan is finished, only on the chosen days.
// POST /functions/v1/remind  Authorization: Bearer <user token>  { action: 'test' } -> sends a test notification now.
//
// JWT verification is off for this function (pg_cron has no user token); every POST is authenticated here instead.
// Secrets: VAPID private key + cron secret live in Supabase Vault (read via service-role-only RPC). The VAPID key pair is
// generated here on first use and never leaves Supabase.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { generateVapid, sendPush, vapidPublicKey, type VapidJwk } from './webpush.ts';
import type { ReminderKind } from './reminders.ts';
import { pickReminderFor } from './reminderPick.ts';

const SUBJECT = 'https://speakup-daily-ten.vercel.app';
const MASTERED_STAGE = 5;
const REVIEW_CAP = 8;
const LIGHT_REVIEWS = 3;

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const fail = (status: number, kind: string, message: string) => reply(status, { error: { kind, message } });

const admin = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

async function secret(sb: SupabaseClient, name: string): Promise<string | null> {
  const { data, error } = await sb.rpc('get_service_secret', { secret_name: name });
  if (error) throw new Error(`secret ${name}: ${error.message}`);
  return (data as string | null) || null;
}

let vapidCache: VapidJwk | null = null;
async function vapid(sb: SupabaseClient): Promise<VapidJwk> {
  if (vapidCache) return vapidCache;
  let raw = await secret(sb, 'vapid_private_jwk');
  if (!raw) {
    const fresh = await generateVapid();
    const { error } = await sb.rpc('put_service_secret_once', { secret_name: 'vapid_private_jwk', secret_value: JSON.stringify(fresh), secret_description: 'Web Push VAPID private key (JWK)' });
    if (error) throw new Error(`store vapid: ${error.message}`);
    raw = await secret(sb, 'vapid_private_jwk'); // re-read: another run may have stored first
  }
  vapidCache = JSON.parse(raw!) as VapidJwk;
  return vapidCache;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

// ---- local time ----
function localNow(tz: string, at = new Date()): { date: string; hm: string; dow: number } {
  let zone = tz;
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone }); } catch { zone = 'Asia/Saigon'; }
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', weekday: 'short' })
    .formatToParts(at).map((p) => [p.type, p.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const dow = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(parts.weekday);
  return { date, hm: `${parts.hour}:${parts.minute}`, dow };
}
const addDays = (d: string, n: number) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

// ---- what's left today ----
interface Status { completed: boolean; questionDone: boolean; reviewsLeft: number; left: string; mins: number; q: string; streak: number; light: boolean; name: string; anyLeft: boolean }

function leftText(questionDone: boolean, reviews: number): string {
  const parts: string[] = [];
  if (!questionDone) parts.push('1 question');
  if (reviews > 0) parts.push(`${reviews} review${reviews > 1 ? 's' : ''}`);
  return parts.join(' + ') || 'nothing';
}

async function status(sb: SupabaseClient, uid: string, date: string): Promise<Status> {
  const [{ data: plan }, { data: prof }] = await Promise.all([
    sb.from('daily_plans').select('*').eq('user_id', uid).eq('plan_date', date).maybeSingle(),
    sb.from('profiles').select('name').eq('user_id', uid).maybeSingle(),
  ]);
  const name = String(prof?.name || '').trim().split(/\s+/)[0] || '';
  if (plan) {
    return {
      completed: !!plan.completed_at, questionDone: !!plan.question_done, reviewsLeft: plan.reviews_left || 0,
      left: plan.left_text || leftText(!!plan.question_done, plan.reviews_left || 0), mins: Math.max(1, plan.left_mins || 0),
      q: plan.question || '', streak: plan.streak || 0, light: !!plan.light, name, anyLeft: (plan.left_mins || 0) > 0,
    };
  }
  // The app hasn't been opened today: work it out from the saved data.
  const yesterday = addDays(date, -1);
  const [ans, due, q, prev, older] = await Promise.all([
    sb.from('answers').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('answer_date', date).is('builder', null).is('replay', null),
    sb.from('phrases').select('id', { count: 'exact', head: true }).eq('user_id', uid).lt('stage', MASTERED_STAGE).lte('due', date),
    sb.from('daily_questions').select('question').eq('user_id', uid).eq('question_date', date).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    sb.from('daily_plans').select('streak,streak_day').eq('user_id', uid).eq('plan_date', yesterday).maybeSingle(),
    sb.from('answers').select('id', { count: 'exact', head: true }).eq('user_id', uid).lt('answer_date', yesterday),
  ]);
  const yAns = prev.data ? null : await sb.from('answers').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('answer_date', yesterday).is('builder', null).is('replay', null);
  const yesterdayDone = prev.data ? !!prev.data.streak_day : (yAns?.count || 0) > 0;
  const light = !yesterdayDone && (older.count || 0) > 0;
  const questionDone = (ans.count || 0) > 0;
  const reviewsLeft = Math.min(due.count || 0, light ? LIGHT_REVIEWS : REVIEW_CAP);
  return {
    completed: false, questionDone, reviewsLeft, left: leftText(questionDone, reviewsLeft),
    mins: (questionDone ? 0 : 4) + reviewsLeft, q: q.data?.question || '', streak: yesterdayDone ? (prev.data?.streak || 1) : 0, light, name, anyLeft: !questionDone || reviewsLeft > 0,
  };
}

function trimQ(q: string): string {
  const t = q.replace(/\s+/g, ' ').trim();
  return t.length > 70 ? `${t.slice(0, 67).replace(/\s+\S*$/, '')}…` : t;
}

function message(kind: ReminderKind, date: string, s: Status) {
  const m = pickReminderFor(kind, date, { name: s.name, left: s.left, mins: s.mins, q: trimQ(s.q) || "today's question", reviews: s.reviewsLeft, streak: s.streak });
  return { title: m.title.replace(/\s{2,}/g, ' '), body: m.body.replace(/""/g, "today's question").replace(/\s{2,}/g, ' ') };
}

async function deliver(sb: SupabaseClient, uid: string, data: Record<string, unknown>): Promise<{ sent: number; statuses: number[] }> {
  const { data: subs } = await sb.from('push_subscriptions').select('id,endpoint,p256dh,auth,failures').eq('user_id', uid);
  const jwk = await vapid(sb);
  const statuses: number[] = [];
  let sent = 0;
  for (const s of subs || []) {
    let st = 0;
    try { st = (await sendPush(s, data, jwk, SUBJECT)).status; } catch { st = 0; }
    statuses.push(st);
    if (st >= 200 && st < 300) {
      sent++;
      await sb.from('push_subscriptions').update({ failures: 0, last_ok_at: new Date().toISOString() }).eq('id', s.id);
    } else if (st === 404 || st === 410 || (s.failures || 0) >= 9) {
      await sb.from('push_subscriptions').delete().eq('id', s.id); // expired or permanently failing
    } else {
      await sb.from('push_subscriptions').update({ failures: (s.failures || 0) + 1 }).eq('id', s.id);
    }
  }
  return { sent, statuses };
}

async function cronRun(sb: SupabaseClient, now = new Date()) {
  const { data: rows, error } = await sb.from('reminder_settings').select('*').eq('enabled', true);
  if (error) throw new Error(error.message);
  const out: Record<string, unknown>[] = [];
  for (const r of rows || []) {
    const t = localNow(r.timezone, now);
    if (!(r.days || []).includes(t.dow)) continue;
    const wantMain = t.hm >= r.remind_time;
    const wantEvening = r.evening && t.hm >= r.evening_time;
    if (!wantMain && !wantEvening) continue;
    const { data: logs } = await sb.from('push_log').select('kind').eq('user_id', r.user_id).eq('local_date', t.date).neq('kind', 'test');
    const done = new Set((logs || []).map((l) => l.kind));
    const eveningOpen = wantEvening && !done.has('evening');
    const mainOpen = wantMain && !done.has('main') && !done.has('evening');
    if (!eveningOpen && !mainOpen) continue;
    const s = await status(sb, r.user_id, t.date);
    if (s.completed) continue; // no pushes after the plan is finished
    const somethingLeft = s.anyLeft;
    let kind: 'main' | 'evening' | null = null;
    if (eveningOpen && !s.questionDone) kind = 'evening'; // the evening nudge is only for an unanswered daily question
    else if (mainOpen && somethingLeft) kind = 'main';
    if (!kind) continue;
    const rk: ReminderKind = kind === 'evening'
      ? (s.streak >= 3 ? 'streakRisk' : 'evening')
      : s.light ? 'comeback' : s.questionDone ? 'onlyReviews' : 'first';
    const msg = message(rk, t.date, s);
    // Claim the slot first (unique index), so overlapping runs can't double-send.
    const { data: claim } = await sb.from('push_log').insert({ user_id: r.user_id, local_date: t.date, kind, title: msg.title, body: msg.body, status: 'sending' }).select('id').maybeSingle();
    if (!claim) continue;
    const res = await deliver(sb, r.user_id, { title: msg.title, body: msg.body, url: '/?plan=1#plan', tag: 'speakup-plan' });
    await sb.from('push_log').update({ sent: res.sent, status: res.statuses.join(',') || 'no subscriptions' }).eq('id', claim.id);
    out.push({ kind, rk, sent: res.sent });
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const sb = admin();
  try {
    if (req.method === 'GET') return reply(200, { publicKey: vapidPublicKey(await vapid(sb)) });
    if (req.method !== 'POST') return fail(405, 'method', 'Use GET or POST.');

    const cronHeader = req.headers.get('x-cron-secret');
    if (cronHeader) {
      const expected = await secret(sb, 'remind_cron_secret');
      if (!expected || !safeEqual(cronHeader, expected)) return fail(401, 'auth', 'Bad cron secret.');
      const results = await cronRun(sb);
      return reply(200, { ok: true, sent: results.length, results });
    }

    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return fail(401, 'auth', 'Sign in first.');
    const { data: u, error: ue } = await sb.auth.getUser(token);
    if (ue || !u?.user) return fail(401, 'auth', 'Your session expired. Sign in again.');
    const body = await req.json().catch(() => ({}));
    if (body?.action !== 'test') return fail(400, 'input', 'Unknown action.');
    const uid = u.user.id;
    const { data: rs } = await sb.from('reminder_settings').select('timezone').eq('user_id', uid).maybeSingle();
    const t = localNow(rs?.timezone || 'Asia/Saigon');
    const { count } = await sb.from('push_log').select('id', { count: 'exact', head: true }).eq('user_id', uid).eq('kind', 'test').gte('created_at', new Date(Date.now() - 3600_000).toISOString());
    if ((count || 0) >= 10) return fail(429, 'rate', 'Too many test notifications. Try again in an hour.');
    const s = await status(sb, uid, t.date);
    const msg = s.completed ? message('done', t.date, s) : message(s.light ? 'comeback' : s.questionDone ? 'onlyReviews' : 'first', t.date, s);
    const res = await deliver(sb, uid, { title: msg.title, body: msg.body, url: '/?plan=1#plan', tag: 'speakup-test' });
    await sb.from('push_log').insert({ user_id: uid, local_date: t.date, kind: 'test', title: msg.title, body: msg.body, sent: res.sent, status: res.statuses.join(',') || 'no subscriptions' });
    if (!res.statuses.length) return fail(404, 'nosub', 'This account has no device with notifications turned on yet.');
    return reply(200, { ok: res.sent > 0, sent: res.sent, statuses: res.statuses, title: msg.title, body: msg.body });
  } catch (e) {
    console.error('remind', e);
    return fail(500, 'server', e instanceof Error ? e.message : String(e));
  }
});
