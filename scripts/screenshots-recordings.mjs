// Saved recordings walkthrough (record -> upload -> play back -> star -> compare -> Settings storage -> delete,
// plus a failed upload that must not block the answer). Mobile 390px, real Supabase project + Storage.
// Needs a confirmed throwaway user. Usage:
//   npm run build && npx vite preview --host 127.0.0.1 --port 4173 &
//   TEST_EMAIL=... TEST_PASSWORD=... node scripts/screenshots-recordings.mjs                    # demo (mock) AI -> screenshots/80-*
//   REAL=1 WAV=/tmp/pron_test.wav TEST_EMAIL=... TEST_PASSWORD=... node scripts/screenshots-recordings.mjs
//        # real AI -> screenshots/81-*; the WAV is fed into Chrome's fake microphone, so Gemini hears real speech.
// Speech recognition and speechSynthesis are faked (headless Chrome has neither); MediaRecorder records the fake mic.
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const REAL = process.env.REAL === '1';
const WAV = process.env.WAV || '';
const PREFIX = process.env.PREFIX || (REAL ? '81' : '80');
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


const recCount = (sel = 'body') => page.evaluate((s) => document.querySelector(s)?.querySelectorAll('[data-recording]').length || 0, sel);
const signReqs = [];
page.on('request', (r) => { if (r.url().includes('/storage/v1/object/sign/recordings')) signReqs.push(r.url()); });
const uploads = [];
page.on('response', (r) => { if (/POST|PUT/.test(r.request().method()) && r.url().includes('/storage/v1/object/recordings/')) uploads.push({ status: r.status(), bytes: (r.request().postData() || '').length }); });

try {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate((real) => { localStorage.clear(); if (!real) localStorage.setItem('speakup.demo', '1'); localStorage.setItem('speakup.todayMode', 'daily'); }, REAL);
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('Sign in to keep your practice saved');
  await page.type('#email', TEST_EMAIL);
  await page.type('#password', TEST_PASSWORD);
  await page.click('form button.btn-primary');
  await page.waitForFunction(() => !document.body.innerText.includes('Sign in to keep your practice saved'), { timeout: 30000 });
  await sleep(800);
  if (await bodyHas('We found practice saved')) await clickText('Not now').catch(() => {});
  await page.waitForFunction(() => document.body.innerText.includes('Your answer') || document.body.innerText.includes("Get today's question"), { timeout: 90000 });
  if (!(await bodyHas('Your answer'))) { await clickText("Get today's question"); await waitText('Your answer'); }
  await page.evaluate(() => document.querySelector('textarea').scrollIntoView({ block: 'center' }));
  await page.click('textarea', { clickCount: 3 });
  await page.keyboard.press('Backspace');

  const ids = () => page.evaluate(() => [...document.querySelectorAll('[data-recording]')].map((e) => e.dataset.recording));
  const waitNew = async (known, timeout = 150000) => {
    await page.waitForFunction((k) => [...document.querySelectorAll('[data-recording]')].some((e) => !k.includes(e.dataset.recording)), { timeout }, known);
    return (await ids()).find((i) => !known.includes(i));
  };
  // 1) Record an answer, upgrade -> recording uploaded in the background
  let known = await ids();
  await speakIntoMic(SAID);
  await clickText('Upgrade my answer').catch(() => clickText('Upgrade again'));
  const id1 = await waitNew(known);
  const size1 = await page.evaluate((id) => document.querySelector(`[data-recording="${id}"]`).innerText, id1);
  ok('answer recording saved (shown under the answer)', uploads.some((u) => u.status < 300), `${uploads.length} upload(s); ${size1.replace(/\s+/g, ' ')}`);
  await shotEl(`${PREFIX}-1-saved`, '[data-testid="recordings"]');

  // 2) Play back via a signed URL, progress moves
  const R = (id) => `[data-recording="${id}"]`;
  await page.evaluate((s) => document.querySelector(`${s} button[aria-label="Play recording"]`).click(), R(id1));
  await page.waitForFunction((s) => Number(document.querySelector(`${s} [role="progressbar"]`)?.getAttribute('aria-valuenow')) >= 1, { timeout: 20000 }, R(id1));
  ok('plays back with progress (signed URL)', signReqs.length >= 1, `${signReqs.length} signed URL request(s)`);
  await sleep(500);
  await shotEl(`${PREFIX}-2-playing`, '[data-testid="recordings"]');
  await page.evaluate((s) => document.querySelector(`${s} button[aria-label="Pause"]`)?.click(), R(id1));

  // 3) Star it; survives reload
  await page.evaluate((s) => document.querySelector(`${s} [data-testid="star"]`).click(), R(id1));
  await sleep(2500);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector(R(id1), { timeout: 30000 });
  ok('star saved (after reload)', await page.evaluate((s) => document.querySelector(`${s} [data-testid="star"]`).getAttribute('aria-pressed') === 'true', R(id1)));

  // 4) Second take of the same answer (for Compare), then a retry recording
  known = await ids();
  await speakIntoMic('and also I think practice every day helps a lot');
  await clickText('Upgrade again');
  await waitNew(known);
  ok('second answer take saved', true);
  await clickText('Hide answer & try again');
  await waitText('Try to use:');
  known = await ids();
  await speakIntoMic('honestly I think it helps me a lot every day', 4000, true);
  await clickText('Check my attempt');
  const idR = await waitNew(known);
  ok('retry recording saved', await page.evaluate((s) => !!document.querySelector(s)?.closest('[data-testid="recordings"]')?.textContent.includes('Your tries'), R(idR)));

  // 5) Upload failure must not block saving: block Storage once, record + upgrade
  await page.setRequestInterception(true);
  const block = (r) => (r.url().includes('/storage/v1/object/recordings/') ? r.abort() : r.continue());
  page.on('request', block);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => document.querySelector('textarea').scrollIntoView({ block: 'center' }));
  await speakIntoMic('one more thing I want to add is that I like it', 4000);
  const before = await recCount('[data-testid="recordings"]');
  await clickText('Upgrade again');
  await page.waitForSelector('[data-testid="rec-note"]', { timeout: 60000 });
  const note = await page.$eval('[data-testid="rec-note"]', (e) => e.textContent);
  ok('failed upload: quiet note, answer still saved', /Recording not saved/.test(note) && (await bodyHas('Say it again')), note);
  await shotEl(`${PREFIX}-3-not-saved`, 'textarea');
  page.off('request', block);
  await page.setRequestInterception(false);
  ok('failed clip not listed', (await recCount('[data-testid="recordings"]')) === before);
  await sleep(3000);

  // 6) History > Daily: players, ⭐ Starred filter, Compare then vs now
  await page.goto(`${BASE}/history?tab=daily`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-daily]', { timeout: 30000 });
  ok('Compare card (then vs now)', !!(await page.$('[data-testid="compare"]')) && (await recCount('[data-testid="compare"]')) === 2);
  await shotEl(`${PREFIX}-4-compare`, '[data-testid="compare"]');
  await page.evaluate(() => [...document.querySelectorAll('[role="tab"]')].find((b) => b.textContent.includes('Starred')).click());
  await sleep(400);
  const starredRows = await page.evaluate(() => document.querySelectorAll('[data-daily]').length);
  ok('⭐ Starred filter', starredRows === 1, `${starredRows} row(s)`);
  await page.evaluate(() => document.querySelector('[data-daily] > button').click());
  await page.waitForFunction(() => document.querySelectorAll('[data-daily] [data-recording]').length >= 3, { timeout: 10000 });
  const hist = await page.evaluate(() => ({ n: document.querySelectorAll('[data-daily] [data-recording]').length, chip: document.querySelector('[data-daily]').innerText.match(/🎧 \d+ ?⭐?/)?.[0] || '' }));
  ok('History detail lists recordings', hist.n >= 3, `${hist.n} players, chip "${hist.chip}"`);
  await page.evaluate(() => document.querySelector('[data-daily] [data-recording] button[aria-label="Play recording"]').click());
  await page.waitForFunction(() => Number(document.querySelector('[data-daily] [data-recording] [role="progressbar"]')?.getAttribute('aria-valuenow')) >= 1, { timeout: 20000 });
  ok('plays back in History', true);
  await shotEl(`${PREFIX}-5-history`, '[data-daily]');

  // 7) Settings: storage line, delete one recording (storage + row)
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="storage-line"]', { timeout: 20000 });
  const line1 = await page.$eval('[data-testid="storage-line"]', (e) => e.textContent);
  ok('Settings storage line', /^Recordings: \d+, about [\d.]+ MB of 1 GB/.test(line1), line1);
  await page.evaluate(() => document.querySelector('[data-testid="recordings-card"] summary').click());
  await sleep(400);
  const n1 = Number(line1.match(/Recordings: (\d+)/)[1]);
  await page.evaluate(() => [...document.querySelectorAll('[data-testid="recordings-card"] [data-recording]')].find((r) => r.querySelector('[data-testid="star"]').getAttribute('aria-pressed') !== 'true').querySelector('[data-testid="delete-recording"]').click());
  await page.waitForFunction((n) => Number(document.querySelector('[data-testid="storage-line"]').textContent.match(/Recordings: (\d+)/)[1]) === n - 1, { timeout: 20000 }, n1);
  await shotEl(`${PREFIX}-6-settings`, '[data-testid="recordings-card"]');
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="storage-line"]', { timeout: 20000 });
  const line2 = await page.$eval('[data-testid="storage-line"]', (e) => e.textContent);
  ok('delete a recording (persists after reload)', Number(line2.match(/Recordings: (\d+)/)[1]) === n1 - 1, `${line1} -> ${line2}`);
} catch (e) {
  ok('unexpected error', false, String(e));
  await page.screenshot({ path: `/tmp/rec-fail-${PREFIX}.png`, fullPage: true }).catch(() => {});
}
const real = errors.filter((e) => !/favicon|Failed to load resource|net::ERR_FAILED|Recording not saved/.test(e));
console.log(real.length ? `PAGE ERRORS:\n${real.join('\n')}` : 'No page errors');
console.log(results.filter((r) => r.startsWith('FAIL')).length ? 'SOME TESTS FAILED' : 'ALL PASSED');
await browser.close();
