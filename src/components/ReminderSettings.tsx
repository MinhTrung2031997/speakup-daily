// Settings → Reminders: time, days, timezone, evening nudge, this device's notifications, test push, calendar backup.
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_REMINDERS, currentSubscription, disablePush, downloadIcs, enablePush, loadReminderSettings, needsHomeScreen, pushSupported, saveReminderSettings, sendTestPush, type ReminderSettings } from '../lib/push';
import { errorText } from '../lib/gemini';
import { Spinner } from './ui';

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const COMMON_TZ = ['Asia/Saigon', 'Asia/Bangkok', 'Asia/Singapore', 'Asia/Tokyo', 'Australia/Sydney', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'UTC'];

function zones(): string[] {
  const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.('timeZone') || [];
  return [...new Set([...COMMON_TZ, ...all])];
}

function fmt12(hm: string): string {
  const [h, m] = hm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export default function ReminderSettingsCard() {
  const [r, setR] = useState<ReminderSettings>();
  const [loadErr, setLoadErr] = useState('');
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [device, setDevice] = useState<'checking' | 'on' | 'off' | 'blocked' | 'unsupported'>('checking');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const first = useRef(true);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    loadReminderSettings().then(setR).catch((e) => { setLoadErr(errorText(e)); setR({ ...DEFAULT_REMINDERS }); });
    refreshDevice();
  }, []);

  const refreshDevice = async () => {
    if (!pushSupported()) { setDevice('unsupported'); return; }
    if (Notification.permission === 'denied') { setDevice('blocked'); return; }
    const sub = await currentSubscription().catch(() => null);
    setDevice(sub && Notification.permission === 'granted' ? 'on' : 'off');
  };

  // Auto-save (debounced) after the first load.
  useEffect(() => {
    if (!r) return;
    if (first.current) { first.current = false; return; }
    clearTimeout(timer.current);
    setSaved('saving');
    timer.current = setTimeout(() => {
      saveReminderSettings(r).then(() => setSaved('saved')).catch((e) => { setSaved('error'); setMsg({ ok: false, text: errorText(e) }); });
    }, 500);
    return () => clearTimeout(timer.current);
  }, [r]);

  useEffect(() => {
    if (r && window.location.hash === '#reminders') setTimeout(() => document.getElementById('reminders')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }, [!!r]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!r) return <section className="card" id="reminders"><h2 className="h-section">⏰ Reminders</h2><Spinner /></section>;
  const set = (p: Partial<ReminderSettings>) => setR((x) => ({ ...(x || DEFAULT_REMINDERS), ...p }));

  const turnOn = async () => {
    setBusy(true); setMsg(null);
    try {
      await enablePush();
      set({ enabled: true });
      setMsg({ ok: true, text: `Notifications are on for this device. You'll get one at ${fmt12(r.time)} if today's plan isn't done.` });
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); refreshDevice(); }
  };
  const turnOff = async () => {
    setBusy(true); setMsg(null);
    try { await disablePush(); setMsg({ ok: true, text: 'Notifications are off for this device.' }); } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); refreshDevice(); }
  };
  const test = async () => {
    setBusy(true); setMsg(null);
    try {
      const out = await sendTestPush();
      setMsg({ ok: true, text: `Sent: "${out.title}" ${out.body}` });
    } catch (e) { setMsg({ ok: false, text: errorText(e) }); } finally { setBusy(false); }
  };

  return (
    <section className="card scroll-mt-20 space-y-3" id="reminders" data-testid="reminders">
      <div>
        <h2 className="h-section">⏰ Reminders</h2>
        <p className="muted">A notification at your time, only when today's plan isn't finished. It says exactly what's left, for example "1 question + 6 reviews, about 12 min".</p>
      </div>
      {loadErr && <p className="text-sm text-rose-600">Couldn't load your reminder settings: {loadErr}</p>}

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="accent-blue-600" checked={r.enabled} onChange={(e) => set({ enabled: e.target.checked })} data-testid="rem-enabled" />
        Send me reminders
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="rem-time">Reminder time</label>
          <input id="rem-time" type="time" className="input" value={r.time} onChange={(e) => e.target.value && set({ time: e.target.value })} data-testid="rem-time" />
        </div>
        <div>
          <label className="label" htmlFor="rem-tz">Time zone</label>
          <select id="rem-tz" className="input" value={r.timezone} onChange={(e) => set({ timezone: e.target.value })} data-testid="rem-tz">
            {zones().map((z) => <option key={z} value={z}>{z.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
      </div>

      <div>
        <p className="label">Days</p>
        <div className="flex gap-1.5" role="group" aria-label="Reminder days">
          {DAYS.map((d, i) => {
            const on = r.days.includes(i);
            return (
              <button key={i} type="button" aria-pressed={on} aria-label={DAY_NAMES[i]} title={DAY_NAMES[i]} data-testid="rem-day"
                onClick={() => set({ days: on ? r.days.filter((x) => x !== i) : [...r.days, i].sort() })}
                className={`h-9 w-9 rounded-full text-sm font-semibold ${on ? 'bg-blue-600 text-white dark:bg-blue-500 dark:text-slate-950' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>{d}</button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="accent-blue-600" checked={r.evening} onChange={(e) => set({ evening: e.target.checked })} data-testid="rem-evening" />
          Evening "streak at risk" nudge at
        </label>
        <input type="time" className="input !w-32 !py-1" value={r.eveningTime} onChange={(e) => e.target.value && set({ eveningTime: e.target.value })} disabled={!r.evening} aria-label="Evening nudge time" data-testid="rem-evening-time" />
        <span className="text-xs text-slate-500">only if the daily question isn't done yet</span>
      </div>
      <p className="text-xs text-slate-500" data-testid="rem-saved">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? '✓ Saved' : saved === 'error' ? 'Not saved' : ''}</p>

      <div className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <p className="text-sm font-semibold">This device</p>
        {needsHomeScreen() ? (
          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-100" data-testid="ios-a2hs">
            <p className="font-semibold">📱 On iPhone, add SpeakUp to your Home Screen first</p>
            <ol className="ml-5 mt-1 list-decimal space-y-0.5">
              <li>In Safari, tap the Share button (the square with the arrow ⬆️).</li>
              <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
              <li>Open SpeakUp from the new icon, come back to Settings and tap <b>Turn on notifications</b>.</li>
            </ol>
            <p className="mt-1 text-xs">iPhone only allows web notifications from Home Screen apps (iOS 16.4 or newer).</p>
          </div>
        ) : (
          <p className="text-sm" data-testid="device-status">
            {device === 'checking' && 'Checking…'}
            {device === 'on' && '🔔 Notifications are on for this device.'}
            {device === 'off' && '🔕 Notifications are off for this device.'}
            {device === 'blocked' && '🚫 Notifications are blocked for this site. Allow them in your browser settings (the lock icon next to the address), then reload.'}
            {device === 'unsupported' && "This browser can't show web notifications. Use the calendar backup below."}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          {device === 'off' && !needsHomeScreen() && <button className="btn-primary" onClick={turnOn} disabled={busy} data-testid="push-on">{busy ? <Spinner /> : '🔔'} Turn on notifications</button>}
          {device === 'on' && <button className="btn-soft" onClick={test} disabled={busy} data-testid="push-test">{busy ? <Spinner /> : '📨'} Send test notification</button>}
          {device === 'on' && <button className="btn-ghost" onClick={turnOff} disabled={busy} data-testid="push-off">Turn off on this device</button>}
          <button className="btn-ghost" onClick={() => downloadIcs(r)} data-testid="add-calendar">📅 Add to calendar</button>
        </div>
        {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-300'}`} data-testid="push-msg">{msg.text}</p>}
        <p className="text-xs text-slate-500">The calendar file adds a repeating {fmt12(r.time)} event as a backup, in case notifications are off.</p>
      </div>
    </section>
  );
}
