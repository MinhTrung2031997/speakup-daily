// Word tracker walkthrough: 3 target words a day on the daily question -> graded after spoken answers (daily, retry, Say it better) -> active after 3 Natural answers -> overused words + swaps on Progress.
// Usage: TEST_EMAIL=... TEST_PASSWORD=... node --experimental-strip-types scripts/screenshots-hunt.mjs  (demo -> 103-*; REAL=1 -> 102-*)
import puppeteer from 'puppeteer-core';
import { CATALOGUE } from '../src/lib/topics.ts';
const norm = (q) => q.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const BANK = new Set(CATALOGUE.flatMap((c) => c.questions.map((q) => norm(q.text))));

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const REAL = process.env.REAL === '1';
const WAV = process.env.WAV || '';
const PREFIX = process.env.PREFIX || (REAL ? (process.env.BASE ? '104' : '102') : '103');
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
      (window.__srLangs = window.__srLangs || []).push(this.lang);
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


const confirmDialog = async (okBtn) => {
  await page.waitForSelector('[data-testid="confirm-dialog"]', { timeout: 5000 });
  const txt = await page.evaluate(() => document.querySelector('[data-testid="confirm-dialog"]').innerText);
  await page.click(okBtn ? '[data-testid="confirm-ok"]' : '[data-testid="confirm-cancel"]');
  await sleep(500);
  return { txt };
};


const T = (s) => page.evaluate((x) => document.querySelector(x)?.innerText || '', s);
const clickSel = async (sel, i = 0) => {
  await page.waitForSelector(sel, { timeout: 30000 });
  await page.evaluate((s, n) => { const all = [...document.querySelectorAll(s)].filter((b) => !b.disabled); const b = n < 0 ? all.at(-1) : all[n]; b.scrollIntoView({ block: 'center' }); b.click(); }, sel, i);
  await sleep(350);
};
const PHRASES = [['worn out', 'very tired'], ['to be honest', 'to say what I really think'], ['get used to', 'slowly become comfortable with something']];
const NOISE = 'I think it is very good and really nice, and I think it is very interesting.';

// Wait until the app has finished saving to the cloud (a hard reload before that would lose the last change).
const synced = async () => { await sleep(1200); await page.waitForFunction(() => document.documentElement.dataset.saving === '0', { timeout: 60000 }); await sleep(800); await page.waitForFunction(() => document.documentElement.dataset.saving === '0', { timeout: 60000 }); };

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
    await sleep(1500);
  }

  // 0) Empty state: tracker with no saved phrases and no answers
  await page.goto(`${BASE}/progress#words`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="word-tracker"]');
  ok('tracker empty state (no phrases, no answers yet)', /Save some phrases first/.test(await T('[data-testid="word-tracker"]')) && (await page.$('[data-testid="overused-empty"]')) !== null);

  // 1) Save 3 phrases (Phrase Bank > Add a phrase)
  await page.goto(`${BASE}/phrases`, { waitUntil: 'networkidle0' });
  await clickText('All phrases');
  await clickSel('[data-testid="add-phrase"]');
  for (const [p, m] of PHRASES) {
    await page.evaluate(() => { document.querySelector('[data-testid="add-phrase-input"]').scrollIntoView({ block: 'center' }); });
    await page.type('[data-testid="add-phrase-input"]', p);
    await page.type('input[placeholder^="Meaning"]', m);
    await clickSel('[data-testid="add-phrase-save"]');
  }
  await synced();

  // 2) Daily question shows 3 "Try to use" chips; same ones after reload (saved per day)
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  if (!(await bodyHas('Your answer'))) { await clickText("Get today's question"); }
  await waitText('Your answer');
  await page.waitForSelector('[data-testid="hunt-chip"]', { timeout: 30000 });
  const chips = await page.evaluate(() => [...document.querySelectorAll('[data-testid="hunt-chip"]')].map((c) => c.firstChild.textContent.trim()));
  const question = await T('[data-testid="question-text"]');
  ok('daily question card shows 3 "Try to use" chips from the saved phrases', chips.length === 3 && chips.every((c) => PHRASES.some(([p]) => p === c)), chips.join(' | '));
  await clickSel('[data-testid="hunt-chip"]');
  ok('tapping a chip shows its meaning', (await T('[data-testid="hunt-meaning"]')).length > 3, await T('[data-testid="hunt-meaning"]'));
  await shotEl(`${PREFIX}-1-chips`, '[data-testid="spoken-question"]');
  await synced();
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="hunt-chip"]', { timeout: 30000 });
  const chips2 = await page.evaluate(() => [...document.querySelectorAll('[data-testid="hunt-chip"]')].map((c) => c.firstChild.textContent.trim()));
  ok('same 3 targets after reload (picked once a day)', JSON.stringify(chips) === JSON.stringify(chips2));

  // 3) Spoken daily answer -> graded targets with evidence
  const answerText = `${NOISE} ${chips[0]} is something I say a lot. To be honest, ${chips[1]} and ${chips[2]} come up in my day too.`.replace(/\s+/g, ' ');
  await speakIntoMic(answerText, 3500);
  await clickText('Upgrade my answer');
  await page.waitForSelector('[data-testid="hunt-use"]', { timeout: 120000 });
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="hunt-use"]').length >= 3, { timeout: 60000 });
  const uses1 = await page.evaluate(() => [...document.querySelectorAll('[data-testid="hunt-use"]')].map((u) => ({ level: u.dataset.level, text: u.innerText.replace(/\s+/g, ' ') })));
  const lv = ['natural', 'forced', 'misused', 'absent'];
  ok('answer graded: 3 targets, valid levels, evidence quoted for any used word', uses1.length === 3 && uses1.every((u) => lv.includes(u.level)) && uses1.filter((u) => u.level !== 'absent').every((u) => /“.+”/.test(u.text)), uses1.map((u) => `${u.level}: ${u.text.slice(0, 90)}`).join(' || '));
  if (!REAL) ok('demo: the 3 used words are Natural (1/3)', uses1.every((u) => u.level === 'natural' && /1\/3/.test(u.text)));
  await shotEl(`${PREFIX}-2-result`, '[data-testid="hunt-result"]');

  // 4) Retry (second spoken answer, a different answer)
  await clickText('Hide answer & try again');
  await speakIntoMic(`${NOISE} ${chips[0]} ${chips[1]} ${chips[2]}. Honestly, I just ${chips[2]} it slowly.`.replace(/\s+/g, ' '), 3500, true);
  await clickText('Check my attempt');
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="hunt-result"] [data-testid="hunt-use"]').length >= 6, { timeout: 120000 }).catch(() => {});
  const nUse = await page.evaluate(() => document.querySelectorAll('[data-testid="hunt-use"]').length);
  ok('the retry is a second answer and is graded too', nUse >= 6, `${nUse} results on the page`);

  await synced();
  // 5) Say it better (third spoken answer)
  await page.goto(`${BASE}/say`, { waitUntil: 'networkidle0' });
  await clickSel('[data-testid="say-starter"]', 0);
  await clickSel('[data-testid="say-go"]');
  await page.waitForSelector('[data-testid="say-flow"]', { timeout: 90000 });
  await clickSel('[data-testid="say-pick"]', 0);
  await sleep(800);
  await speakIntoMic(`${NOISE} ${chips[0]}, ${chips[1]}, ${chips[2]}. I've been tired lately.`.replace(/\s+/g, ' '), 3500, true);
  await clickSel('[data-testid="say-check"]');
  await page.waitForSelector('[data-testid="say-result"] [data-testid="hunt-use"]', { timeout: 120000 });
  ok('Say it better: spoken retry grades the targets too', (await page.$$('[data-testid="say-result"] [data-testid="hunt-use"]')).length === 3);
  await synced();

  // 6) Tracker on Progress
  await page.goto(`${BASE}/progress#words`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="tracker-stats"]');
  const stats = await page.evaluate(() => ({ a: +document.querySelector('[data-testid="stat-active"]').innerText, p: +document.querySelector('[data-testid="stat-progress"]').innerText, s: +document.querySelector('[data-testid="stat-passive"]').innerText }));
  if (!REAL) ok('3 Natural answers -> all 3 words are active', stats.a === 3 && stats.p === 0, JSON.stringify(stats));
  else ok('the 3 targets are active or on the way', stats.a + stats.p === 3, JSON.stringify(stats));
  ok('tracker lists words on the way / active words', !!(await page.$('[data-testid="tracker-word"], [data-testid="tracker-active"]')));
  await shotEl(`${PREFIX}-3-tracker`, '[data-testid="word-tracker"]');
  const ov = await page.evaluate(() => [...document.querySelectorAll('[data-testid="overused-row"]')].map((r) => r.dataset.word));
  ok('overused words counted in code (very / really / i think flagged)', ov.includes('very') && ov.includes('i think') && ov.length <= 5, ov.join(', '));
  ok('fillers line shown', /Fillers:/.test(await T('[data-testid="fillers"]')));
  await shotEl(`${PREFIX}-4-overused`, '[data-testid="overused"]');
  await clickSel('[data-testid="overused-row"][data-word="very"] [data-testid="swaps-btn"]');
  await page.waitForSelector('[data-testid="swaps"] li', { timeout: 90000 });
  const nsw = (await page.$$('[data-testid="swaps"] li')).length;
  ok('"Better words" gives 3 swaps with examples', nsw === 3, await T('[data-testid="swaps"]'));
  await shotEl(`${PREFIX}-5-swaps`, '[data-testid="overused-row"][data-word="very"]');
  await synced();
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="overused-row"]');
  const t0 = Date.now();
  await clickSel('[data-testid="overused-row"][data-word="very"] [data-testid="swaps-btn"]');
  await page.waitForSelector('[data-testid="swaps"] li', { timeout: 5000 });
  ok('swaps are saved: shown again after reload without a new AI call', Date.now() - t0 < 2500, `${Date.now() - t0} ms`);

  // 7) Natural use -> learned by voice on the phrase
  await page.goto(`${BASE}/phrases`, { waitUntil: 'networkidle0' });
  const sub = await T('h1 + p');
  const lbv = Number((sub.match(/(\d+) learned by voice/) || [])[1] || 0);
  if (!REAL) ok('Natural uses mark the phrases learned by voice', lbv === 3, sub);
  else ok('Phrase Bank subtitle readable', /learned by voice/.test(sub), sub);

  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  await page.goto(`${BASE}/progress#words`, { waitUntil: 'networkidle0' });
  const sw2 = await page.evaluate(() => document.documentElement.scrollWidth);
  ok('no horizontal scroll at 390px', sw <= 390 && sw2 <= 390, `${sw}/${sw2}`);
  const errs = errors.filter((e) => !/favicon|ERR_ABORTED|status of 4\d\d/.test(e));
  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('QUESTION:', question);
} catch (e) {
  console.log('ERROR', e.message);
  await page.screenshot({ path: `${OUT}${PREFIX}-error.png`, fullPage: true }).catch(() => {});
  results.push('FAIL crashed: ' + e.message);
}
await browser.close();
const pass = results.filter((r) => r.startsWith('PASS')).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
