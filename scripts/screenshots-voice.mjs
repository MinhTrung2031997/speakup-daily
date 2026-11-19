// Suggested-answer versions (no cap, delete with a confirm popup) + hear the question (natural voice) + Listening mode.
// Usage: node --experimental-strip-types scripts/screenshots-voice.mjs (TEST_EMAIL/TEST_PASSWORD; REAL=1 for real AI -> 91-*, else demo -> 90-*)
// Old recordings walkthrough (record -> upload -> play back -> star -> compare -> Settings storage -> delete,
// plus a failed upload that must not block the answer). Mobile 390px, real Supabase project + Storage.
// Needs a confirmed throwaway user. Usage:
//   npm run build && npx vite preview --host 127.0.0.1 --port 4173 &
//   TEST_EMAIL=... TEST_PASSWORD=... node scripts/screenshots-recordings.mjs                    # demo (mock) AI -> screenshots/80-*
//   REAL=1 WAV=/tmp/pron_test.wav TEST_EMAIL=... TEST_PASSWORD=... node scripts/screenshots-recordings.mjs
//        # real AI -> screenshots/81-*; the WAV is fed into Chrome's fake microphone, so Gemini hears real speech.
// Speech recognition and speechSynthesis are faked (headless Chrome has neither); MediaRecorder records the fake mic.
import puppeteer from 'puppeteer-core';
import { CATALOGUE } from '../src/lib/topics.ts';
const norm = (q) => q.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const BANK = new Set(CATALOGUE.flatMap((c) => c.questions.map((q) => norm(q.text))));

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const REAL = process.env.REAL === '1';
const WAV = process.env.WAV || '';
const PREFIX = process.env.PREFIX || (REAL ? '95' : '94');
const OUT = process.env.OUT || new URL('../screenshots/', import.meta.url).pathname;
const { TEST_EMAIL, TEST_PASSWORD } = process.env;
if (!TEST_EMAIL || !TEST_PASSWORD) throw new Error('Set TEST_EMAIL and TEST_PASSWORD');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// What the test clip says (with planted slips: "ask" for asked, "tree" for three, "tink" for think)
// and what Chrome's recogniser would type (it drops fillers and auto-corrects).
const SAID = 'so I work as a developer last month I asked my team about the three things we think matter it was really useful';
const CLIP_MS = WAV ? 18000 : 4000;
// Demo run uses the UK accent (Listen tab choice) to check tips/playback follow it; the real run uses the default (US).
const ACCENT = process.env.ACCENT || (REAL ? 'US' : 'UK');

const args = ['--no-sandbox', '--disable-gpu', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
if (WAV) args.push(`--use-file-for-fake-audio-capture=${WAV}%noloop`);
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept());
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

await page.evaluateOnNewDocument(() => {
  const voices = [{ name: 'Fake US Joanna', lang: 'en-US', voiceURI: 'us1', default: true, localService: true }, { name: 'Fake UK Amy', lang: 'en-GB', voiceURI: 'gb1', default: false, localService: true }];
  window.__spoken = [];
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; this.rate = 1; this.pitch = 1; } };
  let timers = [];
  const synth = {
    speak(u) { window.__spoken.push({ text: u.text, rate: u.rate, lang: u.lang }); timers.push(setTimeout(() => u.onend && u.onend(), 150)); },
    cancel() { timers.forEach(clearTimeout); timers = []; },
    getVoices: () => voices,
    addEventListener() {}, removeEventListener() {},
    speaking: false, pending: false, paused: false,
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.__speechPlans = [];
  class FakeSR {
    constructor() { this._t = []; this._res = []; }
    _emit(r) {
      const results = { length: this._res.length + 1 };
      this._res.forEach((x, i) => (results[i] = x));
      results[this._res.length] = r;
      if (r.isFinal) this._res.push(r);
      this.onresult && this.onresult({ resultIndex: this._res.length - (r.isFinal ? 1 : 0), results });
    }
    start() {
      const plan = window.__speechPlans.shift() || [];
      let t = 0;
      for (const [silence, speakMs, text] of plan) { t += silence + speakMs; this._t.push(setTimeout(() => this._emit({ isFinal: true, 0: { transcript: text }, length: 1 }), t)); }
    }
    stop() { this._t.forEach(clearTimeout); setTimeout(() => this.onend && this.onend(), 30); }
    abort() { this.stop(); }
  }
  window.SpeechRecognition = FakeSR;
  window.webkitSpeechRecognition = FakeSR;
});

const results = [];
const timings = {};
const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); console.log(results.at(-1)); };
const clickText = async (text, scope = 'button, a') => {
  const done = await page.evaluate((t, sel) => {
    const el = [...document.querySelectorAll(sel)].find((b) => b.textContent.trim().includes(t) && !b.disabled);
    if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return true; }
    return false;
  }, text, scope);
  if (!done) throw new Error(`Could not click "${text}"`);
};
const waitText = (t, timeout = 90000) => page.waitForFunction((x) => document.body.innerText.toLowerCase().includes(x.toLowerCase()), { timeout }, t);
const bodyHas = (t) => page.evaluate((x) => document.body.innerText.toLowerCase().includes(x.toLowerCase()), t);
const shotEl = async (name, selector, index = 0) => {
  await sleep(500);
  await page.addStyleTag({ content: 'header, nav { position: static !important; }' });
  const box = await page.evaluate((sel, i) => {
    const el = document.querySelectorAll(sel)[i];
    if (!el) return null;
    el.scrollIntoView({ block: 'start' });
    const r = el.getBoundingClientRect();
    return { x: 0, y: Math.max(0, r.top + window.scrollY - 8), width: window.innerWidth, height: r.height + 16 };
  }, selector, index);
  if (box) await page.screenshot({ path: `${OUT}${name}.png`, clip: box, captureBeyondViewport: true });
  else await page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
  console.log('saved', name);
};

/** Record with the fake mic: speech recognition types `text`, MediaRecorder records the (WAV) mic. */
const speakIntoMic = async (text, ms = CLIP_MS, last = false) => {
  await page.evaluate((s, d) => window.__speechPlans.push([[400, Math.max(600, d - 1200), s]]), text, ms);
  await page.evaluate((l) => { const all = document.querySelectorAll('button[title="Answer by voice"]'); const b = all[l ? all.length - 1 : 0]; b.scrollIntoView({ block: 'center' }); b.click(); }, last);
  await sleep(ms);
  await page.evaluate(() => document.querySelector('button[title="Stop recording"]').click());
  await sleep(800);
};




const tts = [];
page.on('response', (r) => { if (r.url().includes('/functions/v1/tts')) tts.push(r.status()); });
const T = (s) => page.evaluate((x) => document.querySelector(x)?.innerText || '', s);
const nVersions = () => page.evaluate(() => document.querySelectorAll('#suggested-answer [data-version]').length);
const confirmDialog = async (ok) => {
  await page.waitForSelector('[data-testid="confirm-dialog"]', { timeout: 5000 });
  const txt = await T('[data-testid="confirm-dialog"]');
  const focused = await page.evaluate(() => document.activeElement?.dataset.testid);
  await page.click(ok ? '[data-testid="confirm-ok"]' : '[data-testid="confirm-cancel"]');
  await sleep(400);
  return { txt, focused };
};

try {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate((real) => { localStorage.clear(); if (!real) localStorage.setItem('speakup.demo', '1'); localStorage.setItem('speakup.todayMode', 'daily'); localStorage.setItem('speakup.listen', JSON.stringify({ accent: 'UK' })); }, REAL);
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('Sign in to keep your practice saved');
  await page.type('#email', TEST_EMAIL);
  await page.type('#password', TEST_PASSWORD);
  await page.click('form button.btn-primary');
  await page.waitForFunction(() => !document.body.innerText.includes('Sign in to keep your practice saved'), { timeout: 30000 });
  await page.waitForFunction(() => /Tell me about you|Your answer|Get today's question/.test(document.body.innerText), { timeout: 90000 });
  if (await bodyHas('Tell me about you')) {
    await page.type('input[placeholder="Trung"]', 'Trung');
    await page.type('input[placeholder="e.g. software developer"]', 'software developer');
    await clickText('Next');
    await clickText('Start speaking');
  }
  await page.waitForFunction(() => document.body.innerText.includes('Your answer') || document.body.innerText.includes("Get today's question"), { timeout: 90000 });
  if (!(await bodyHas('Your answer'))) { await clickText("Get today's question"); await waitText('Your answer'); }

  // 1) The question is asked aloud on open (natural voice; browser voice in demo)
  await page.waitForSelector('[data-testid="ask-aloud"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="ask-aloud"]')?.dataset.voice, { timeout: 60000 }).catch(() => {});
  const voice = await page.$eval('[data-testid="ask-aloud"]', (e) => e.dataset.voice);
  const spoken = await page.evaluate(() => window.__spoken.map((x) => `${x.text} [${x.lang}]`));
  if (REAL) ok('question asked aloud by the natural voice (auto-play)', voice === 'natural' && tts.includes(200), `tts ${tts.join(',')}; voice=${voice}`);
  else ok('question asked aloud (demo: browser voice, UK, with the lead-in)', /^Hey Trung, quick question…/.test(spoken[0] || '') && /en-GB/.test(spoken[0] || ''), spoken[0]);
  await shotEl(`${PREFIX}-1-question-voice`, '[data-testid="spoken-question"]');

  // Replay button plays again (cached on the 2nd time)
  const n0 = tts.length;
  await page.click('[data-testid="ask-aloud"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="ask-aloud"]')?.dataset.state !== 'idle', { timeout: 20000 }).catch(() => {});
  await page.waitForFunction(() => document.querySelector('[data-testid="ask-aloud"]')?.dataset.state === 'idle', { timeout: 30000 }).catch(() => {});
  ok('🔊 replay button plays again', REAL ? tts.length === n0 : (await page.evaluate(() => window.__spoken.length)) >= 2, REAL ? 'served from the in-page cache (no new TTS call)' : '');

  // 2) Listening mode on the card
  await page.click('[data-testid="listening-toggle"]');
  await sleep(300);
  ok('Listening mode hides the question text', !!(await page.$('[data-testid="question-hidden"]')) && !(await page.$('[data-testid="question-text"]')));
  await shotEl(`${PREFIX}-2-listening-mode`, '[data-testid="spoken-question"]');
  await page.click('[data-testid="show-text"]');
  ok('Show text reveals it', !!(await page.$('[data-testid="question-text"]')));

  // 3) Suggested answer versions: no cap
  await clickText('Show a suggested answer');
  await page.waitForSelector('#suggested-answer [data-version]', { timeout: 150000 });
  const target = REAL ? 3 : 7;
  while ((await nVersions()) < target) {
    const n = await nVersions();
    await clickText('Another angle');
    await page.waitForFunction((k) => document.querySelectorAll('#suggested-answer [data-version]').length > k, { timeout: 150000 }, n);
  }
  ok(`no 5-version cap (${target} versions)`, (await nVersions()) === target, await T('[data-testid="version-count"]'));
  // A level switch keeps the old version and adds a new one
  const before = await nVersions();
  await page.evaluate(() => [...document.querySelectorAll('#suggested-answer [data-open] button')].find((b) => b.textContent.trim() === 'Simple' && !b.disabled)?.click());
  await page.waitForFunction((k) => document.querySelectorAll('#suggested-answer [data-version]').length > k, { timeout: 150000 }, before).catch(() => {});
  ok('level switch saves a NEW version (old kept)', (await nVersions()) === before + 1, `${before} -> ${await nVersions()}`);
  await sleep(3000);
  await shotEl(`${PREFIX}-3-versions`, '#suggested-answer');

  // 4) Delete with the confirm popup: Cancel keeps it, Delete removes it for good
  const n1 = await nVersions();
  await page.evaluate(() => { const b = document.querySelectorAll('[data-testid="version-delete"]')[0]; b.scrollIntoView({ block: 'center' }); b.click(); });
  await sleep(300);
  await sleep(400); await page.screenshot({ path: `screenshots/${PREFIX}-4-confirm.png` });
  const c1 = await confirmDialog(false);
  ok('confirm popup text + Cancel focused', /Delete this version permanently\?/.test(c1.txt) && /can't be undone/.test(c1.txt) && c1.focused === 'confirm-cancel', c1.txt.replace(/\s+/g, ' '));
  ok('Cancel keeps the version', (await nVersions()) === n1);
  await page.evaluate(() => document.querySelectorAll('[data-testid="version-delete"]')[0].click());
  await page.keyboard.press('Escape');
  await sleep(300);
  ok('Esc closes the popup without deleting', !(await page.$('[data-testid="confirm-dialog"]')) && (await nVersions()) === n1);
  const firstLabel = await page.evaluate(() => document.querySelector('#suggested-answer [data-version="1"]')?.innerText.split('\n')[0]);
  await page.evaluate(() => document.querySelectorAll('[data-testid="version-delete"]')[0].click());
  await confirmDialog(true);
  ok('Delete removes the version', (await nVersions()) === n1 - 1, `${n1} -> ${await nVersions()} (${firstLabel})`);
  await sleep(3500);

  // 5) After reload, still deleted (removed from the database)
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('Your answer');
  await clickText('Show a suggested answer');
  await page.waitForSelector('#suggested-answer [data-version]', { timeout: 30000 });
  ok('still deleted after reload (saved in the DB)', (await nVersions()) === n1 - 1, `${await nVersions()} versions`);

  // 6) Answer -> question text shows again in Listening mode
  ok('Listening mode still on after reload (saved setting)', !!(await page.$('[data-testid="question-hidden"]')));
  await page.evaluate(() => document.querySelector('textarea').scrollIntoView({ block: 'center' }));
  await speakIntoMic('I think a productive day starts with a clear plan and a few hours of focused work');
  await clickText('Upgrade my answer');
  await waitText('Say it again', 150000);
  ok('question text shows after answering', !!(await page.$('[data-testid="question-text"]')));

  // 7) History > Daily lists every version with the same delete
  await page.goto(`${BASE}/history?tab=daily`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-daily]', { timeout: 30000 });
  await page.evaluate(() => document.querySelector('[data-daily] button').click());
  await sleep(800);
  const hv = await page.evaluate(() => document.querySelectorAll('[data-daily] #suggested-answer [data-version]').length);
  ok('History > Daily shows all versions', hv === n1 - 1, `${hv}`);

  // 8) Answer builder question: 🔊 + Listening mode
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.setItem('speakup.todayMode', 'builder'));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="builder-topics"]', { timeout: 30000 });
  await page.evaluate(() => [...document.querySelectorAll('[data-testid="builder-topics"] button')].find((x) => x.textContent.includes('Travel')).click());
  await page.evaluate(() => [...document.querySelectorAll('button')].find((x) => /Just the question|Get a question/.test(x.textContent)).click());
  await page.waitForSelector('[data-testid="spoken-question"] [data-testid="ask-aloud"]', { timeout: 60000 });
  ok('Answer builder question has 🔊 and Listening mode', !!(await page.$('[data-testid="spoken-question"] [data-testid="listening-toggle"]')));
  await page.evaluate(() => localStorage.setItem('speakup.todayMode', 'daily'));

  // 9) Settings card
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="voice-card"]', { timeout: 30000 });
  ok('Settings: voice card (auto-play, Listening mode, accent)', await page.$eval('[data-testid="listening-setting"]', (e) => e.checked));
  await page.click('[data-testid="listening-setting"]');
  await shotEl(`${PREFIX}-5-settings`, '[data-testid="voice-card"]');
  ok('no horizontal scroll at 390px', await page.evaluate(() => document.documentElement.scrollWidth <= 392));
} catch (e) {
  ok('script error', false, String(e).slice(0, 300));
  await page.screenshot({ path: `${OUT}${PREFIX}-error.png`, fullPage: true }).catch(() => {});
}
const bad = errors.filter((e) => !/favicon|ResizeObserver|net::ERR_FAILED|Failed to load resource/.test(e));
ok('no page errors', bad.length === 0, bad.slice(0, 3).join(' | '));
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
await browser.close();
