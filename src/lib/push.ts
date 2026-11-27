// Web Push on this device + reminder settings + calendar backup (.ics).
import { supabase, SUPABASE_URL } from './supabase';

/** VAPID application server key (public). The private half lives only in Supabase Vault. */
export const VAPID_PUBLIC_KEY = 'BJw3bM4Oq8HoZ9yduK9TNGBIxPKBxwyiS99ia9aCrmBTrF2DwLlbtyHLcQHbnQemm7imXisxrnpihGcIOyDKjmM';
export const APP_URL = 'https://speakup-daily-ten.vercel.app';

export interface ReminderSettings {
  enabled: boolean;
  time: string; // HH:MM
  days: number[]; // 0 = Sunday
  timezone: string;
  evening: boolean;
  eveningTime: string;
}
export const DEFAULT_REMINDERS: ReminderSettings = { enabled: false, time: '20:00', days: [0, 1, 2, 3, 4, 5, 6], timezone: 'Asia/Saigon', evening: true, eveningTime: '21:30' };

export async function loadReminderSettings(): Promise<ReminderSettings> {
  const { data, error } = await supabase.from('reminder_settings').select('*').maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { ...DEFAULT_REMINDERS };
  return { enabled: data.enabled, time: data.remind_time, days: data.days || [], timezone: data.timezone, evening: data.evening, eveningTime: data.evening_time };
}

export async function saveReminderSettings(r: ReminderSettings): Promise<void> {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Sign in first.');
  const { error } = await supabase.from('reminder_settings').upsert({
    user_id: u.user.id, enabled: r.enabled, remind_time: r.time, days: [...new Set(r.days)].sort(), timezone: r.timezone, evening: r.evening, evening_time: r.eveningTime, updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
}

// ---- device ----
export const pushSupported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
/** iPhone/iPad Safari outside the Home Screen app can't get web push. */
export const needsHomeScreen = () => isIOS() && !isStandalone();

function keyBytes(b64: string): Uint8Array {
  const p = b64.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64.length + 3) % 4);
  return Uint8Array.from(atob(p), (c) => c.charCodeAt(0));
}

export async function swRegistration(): Promise<ServiceWorkerRegistration> {
  const reg = (await navigator.serviceWorker.getRegistration('/')) || (await navigator.serviceWorker.register('/sw.js'));
  await navigator.serviceWorker.ready;
  return reg;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
}

/** Ask permission, subscribe this device and save it (push_subscriptions, RLS: own rows). */
export async function enablePush(): Promise<void> {
  if (!pushSupported()) throw new Error(needsHomeScreen() ? 'On iPhone, add SpeakUp to your Home Screen first, then open it from the icon.' : "This browser can't show notifications.");
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error(perm === 'denied' ? 'Notifications are blocked for this site. Allow them in your browser settings, then try again.' : 'Notifications were not allowed.');
  const reg = await swRegistration();
  let sub = await reg.pushManager.getSubscription();
  const key = keyBytes(VAPID_PUBLIC_KEY);
  if (sub && sub.options.applicationServerKey) {
    const cur = new Uint8Array(sub.options.applicationServerKey);
    if (cur.length !== key.length || cur.some((b, i) => b !== key[i])) { await sub.unsubscribe(); sub = null; }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key as BufferSource });
  const j = sub.toJSON();
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) throw new Error('Sign in first.');
  const { error } = await supabase.from('push_subscriptions').upsert({
    user_id: u.user.id, endpoint: j.endpoint!, p256dh: j.keys!.p256dh, auth: j.keys!.auth, user_agent: navigator.userAgent.slice(0, 300), failures: 0,
  }, { onConflict: 'endpoint' });
  if (error) throw new Error(error.message);
}

export async function disablePush(): Promise<void> {
  const sub = await currentSubscription();
  if (!sub) return;
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
  await sub.unsubscribe().catch(() => undefined);
}

export async function sendTestPush(): Promise<{ title: string; body: string; sent: number }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sign in first.');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/remind`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ action: 'test' }),
  });
  const out = await res.json().catch(() => null);
  if (!res.ok) throw new Error(out?.error?.message || `Test failed (${res.status})`);
  if (!out?.sent) throw new Error('The push service did not accept the message. Turn notifications off and on again on this device.');
  return out;
}

// ---- calendar backup ----
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
export function reminderIcs(r: ReminderSettings, now = new Date()): string {
  const [hh, mm] = r.time.split(':');
  const local = new Intl.DateTimeFormat('en-CA', { timeZone: r.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now).replace(/-/g, '');
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const days = r.days.length ? [...r.days].sort() : [0, 1, 2, 3, 4, 5, 6];
  const rule = days.length === 7 ? 'RRULE:FREQ=DAILY' : `RRULE:FREQ=WEEKLY;BYDAY=${days.map((d) => BYDAY[d]).join(',')}`;
  const link = `${APP_URL}/?plan=1#plan`;
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SpeakUp Daily//Reminder//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    'UID:speakup-daily-plan-reminder@speakup-daily',
    `DTSTAMP:${stamp}`,
    `DTSTART;TZID=${r.timezone}:${local}T${hh}${mm}00`,
    'DURATION:PT15M',
    rule,
    'SUMMARY:SpeakUp Daily: today\'s plan (10-15 min)',
    `DESCRIPTION:Daily question + due reviews\\, about 10-15 minutes. Open your plan: ${link}`,
    `URL:${link}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT0M', 'DESCRIPTION:Time for SpeakUp Daily', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

export function downloadIcs(r: ReminderSettings) {
  const blob = new Blob([reminderIcs(r)], { type: 'text/calendar;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'speakup-daily-reminder.ics';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}
