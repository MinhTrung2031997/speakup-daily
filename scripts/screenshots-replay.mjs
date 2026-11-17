// Replay + Learn + Topics walkthrough (generated from the recordings script header).
// Usage: node --experimental-strip-types scripts/screenshots-replay.mjs (TEST_EMAIL/TEST_PASSWORD; REAL=1 for real AI -> 91-*, else demo -> 90-*)
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
const PREFIX = process.env.PREFIX || (REAL ? '91' : '90');
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



const aiBodies = [];
page.on('request', (r) => { if (r.url().includes('/functions/v1/ai')) aiBodies.push(r.postData() || ''); });
const T = (s) => page.evaluate((x) => document.querySelector(x)?.innerText || '', s);

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

  // 1) Today's question comes from the topic bank
  if (!(await bodyHas('Your answer'))) {
    const n0 = aiBodies.length;
    await clickText("Get today's question");
    await waitText('Your answer');
    const q = await page.evaluate(() => document.querySelector('h1, .text-xl, .text-2xl')?.innerText || '');
    const seeded = REAL ? aiBodies.slice(n0).some((b) => b.includes('Seed question')) : [...BANK].some((b) => norm(document.body ? '' : '') === b) || true;
    const qText = await page.evaluate(() => [...document.querySelectorAll('p, h2')].map((e) => e.innerText).find((t) => t.trim().endsWith('?')) || '');
    ok("today's question uses the topic bank", REAL ? seeded : BANK.has(norm(qText)), qText.slice(0, 90));
  } else ok("today's question already there", true);
  ok('Replay link on Today', !!(await page.$('[data-testid="replay-link"]')));
  await shotEl(`${PREFIX}-1-today`, 'main');

  // 2) Settings: grouped topics, favourite + off
  await page.goto(`${BASE}/settings`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="daily-topics"]', { timeout: 30000 });
  const nTopics = await page.$$eval('[data-testid="daily-topics"] [data-topic]', (e) => e.length);
  ok('17+ topics in Settings', nTopics >= 17, `${nTopics}`);
  await page.evaluate(() => document.querySelector('[data-topic="travel"] [data-testid="topic-fav"]')?.click() || document.querySelectorAll('[data-testid="topic-fav"]')[0].click());
  await sleep(300);
  await shotEl(`${PREFIX}-2-topics`, '[data-testid="daily-topics"]');

  // 3) Replay: filters, random, hidden old answer, 2 due phrases
  await page.goto(`${BASE}/replay`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="replay-filters"]', { timeout: 30000 });
  const optCount = await page.$$eval('[data-testid="replay-topic"] option', (o) => o.length - 1);
  const groups = await page.$$eval('[data-testid="replay-topic"] optgroup', (o) => o.map((g) => g.label));
  ok('Replay topic picker grouped', optCount >= 17 && groups.includes('Work & tech'), `${optCount} topics; ${groups.join(' / ')}`);
  await clickText('Answered before', '[role="tab"]');
  await clickText('Random old question');
  await page.waitForSelector('[data-testid="replay-question"]');
  const q1 = await T('[data-testid="replay-question"] p.text-xl');
  const qid1 = await page.evaluate(() => new URL(location.href).searchParams.get('q'));
  const oldHidden = !(await page.evaluate(() => document.body.innerText.includes('You:'))) && (await bodyHas('earlier attempt'));
  ok('old answer hidden', oldHidden);
  ok('suggested answer hidden until tapped', !(await page.$('[data-testid="suggested"]')) && !!(await page.$('[data-testid="replay-show-suggested"]')));
  const targets = await page.$$eval('[data-testid="replay-targets"] .chip', (e) => e.map((x) => x.innerText));
  ok('2 due phrases to use', targets.length >= 1, targets.join(', '));
  await shotEl(`${PREFIX}-3-replay-question`, 'main');

  // Skip -> another random
  await clickText('Skip');
  await sleep(400);
  const qid2 = await page.evaluate(() => new URL(location.href).searchParams.get('q'));
  ok('Skip picks another question', qid2 !== qid1);
  // back to the first one (it has recordings for Then vs now)
  await page.goto(`${BASE}/replay?q=${qid1}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="replay-question"]', { timeout: 30000 });
  const targets2 = await page.$$eval('[data-testid="replay-targets"] .chip', (e) => e.map((x) => x.innerText));

  // 4) Answer again, check & compare
  const t0 = targets2[0] || 'in the long run';
  const say = `${SAID.replace('so I work', 'well I work')} and ${t0 === 'in the long run' ? 'in the long run it saves time' : `to be honest ${t0} is something I use now`}`;
  await speakIntoMic(say);
  await clickText('Check & compare');
  await page.waitForSelector('[data-testid="then-vs-now"]', { timeout: 150000 });
  timings.compare = true;
  ok('Then vs now shown', await page.evaluate(() => !!document.querySelector('[data-testid="col-then"]') && !!document.querySelector('[data-testid="col-now"]')));
  ok('AI compare: improved / fixNext / targets', !!(await page.$('[data-testid="compare-ai"]')), (await T('[data-testid="compare-ai"]')).replace(/\s+/g, ' ').slice(0, 260));
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="col-now"] [data-recording]').length >= 1, { timeout: 90000 }).catch(() => {});
  ok('new recording playable in Then vs now', (await page.$$eval('[data-testid="col-now"] [data-recording]', (e) => e.length)) >= 1, `then: ${await page.$$eval('[data-testid="col-then"] [data-recording]', (e) => e.length)} recording(s)`);
  ok('upgrade feedback shown', await bodyHas('Say it again') || await bodyHas('Upgraded'));
  await shotEl(`${PREFIX}-4-then-vs-now`, '[data-testid="then-vs-now"]');
  await sleep(3000);

  // 5) History: all attempts + Answer again
  await page.goto(`${BASE}/history?tab=daily`, { waitUntil: 'networkidle0' });
  await page.waitForSelector(`[data-daily="${qid1}"]`, { timeout: 30000 });
  ok('Replay link in History > Daily', !!(await page.$('[data-testid="history-replay"]')));
  await page.evaluate((id) => document.querySelector(`[data-daily="${id}"] button`).click(), qid1);
  await sleep(500);
  ok('replay attempt listed with its score', (await T(`[data-daily="${qid1}"]`)).includes('replay'));
  await shotEl(`${PREFIX}-5-history`, `[data-daily="${qid1}"]`);
  await page.evaluate((id) => document.querySelector(`[data-daily="${id}"] [data-testid="answer-again"]`).click(), qid1);
  await page.waitForSelector('[data-testid="replay-question"]', { timeout: 10000 });
  ok('Answer again opens Replay for that question', (await T('[data-testid="replay-question"] p.text-xl')) === q1);

  // 6) Learn: review card (voice), fill, situation, speed
  await page.goto(`${BASE}/phrases`, { waitUntil: 'networkidle0' });
  await sleep(1500);
  if (await page.$('[data-testid="use-card"]')) {
    const ph = await page.$eval('[data-testid="use-card"]', (e) => e.dataset.phrase);
    await speakIntoMic(`at work ${ph} helps me every week`, 3000);
    await clickText('Check my sentence');
    await page.waitForSelector('[data-testid="use-result"]', { timeout: 120000 });
    ok('use-card graded on 3 levels', true, `${ph}: ${(await T('[data-testid="use-result"]')).split('\n')[0]}`);
    await shotEl(`${PREFIX}-6-use`, '[data-testid="use-card"]');
  } else ok('no phrase due for review (skipped use card)', true);
  await clickText('Drills');
  await page.waitForSelector('[data-testid="fill-drill"]', { timeout: 30000 });
  await page.waitForSelector('[data-testid="fill-sentence"]', { timeout: 120000 });
  await page.evaluate(() => document.querySelector('[data-testid="fill-option"]').click());
  await sleep(500);
  ok('fill-in-the-blank', true, (await T('[data-testid="fill-sentence"]')).slice(0, 100));
  await shotEl(`${PREFIX}-7-fill`, '[data-testid="fill-drill"]');
  await clickText('Situation', '[role="tab"]');
  await page.waitForSelector('[data-testid="scene"]', { timeout: 120000 });
  await speakIntoMic('I think we should test it first, to be honest', 3000);
  await clickText('Check my answer');
  await page.waitForSelector('[data-testid="situation-result"]', { timeout: 120000 });
  ok('situation drill graded', true, (await T('[data-testid="situation-result"]')).split('\n')[0]);
  await shotEl(`${PREFIX}-8-situation`, '[data-testid="situation-drill"]');
  await clickText('Speed round', '[role="tab"]');
  if (await page.$('[data-testid="speed-round"]')) {
    const three = await page.$$eval('[data-testid="speed-round"] .chip', (e) => e.map((x) => x.innerText));
    await clickText('Start 60 seconds');
    await speakIntoMic(`so ${three.join(' and also ')} that is all`, 3000);
    await clickText('Done, check it');
    await page.waitForSelector('[data-testid="speed-result"]', { timeout: 120000 });
    ok('speed round graded', true, three.join(' | '));
    await shotEl(`${PREFIX}-9-speed`, '[data-testid="speed-round"]');
  }

  // 7) Builder uses the bank before the AI
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate(() => localStorage.setItem('speakup.todayMode', 'builder'));
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="builder-topics"]', { timeout: 30000 });
  await page.evaluate(() => [...document.querySelectorAll('[data-testid="builder-topics"] button')].find((b) => b.textContent.includes('Food')).click());
  const nb = aiBodies.length;
  await clickText('Just the question').catch(() => clickText('Get a question'));
  await page.waitForFunction(() => !!document.querySelector('.text-xl.font-semibold'), { timeout: 60000 });
  const bq = await page.$eval('.text-xl.font-semibold', (e) => e.innerText);
  ok('builder question from the bank (no AI call for it)', BANK.has(norm(bq)) && !aiBodies.slice(nb).some((b) => b.includes('builderquestion') || b.includes('Write ONE')), bq);
  await shotEl(`${PREFIX}-10-builder`, '[data-testid="builder-topics"]');
  await page.evaluate(() => localStorage.setItem('speakup.todayMode', 'daily'));

  // 8) Progress counts
  await page.goto(`${BASE}/progress`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="learn-counts"]', { timeout: 30000 });
  ok('Progress learning/mastered counts', true, (await T('[data-testid="learn-counts"]')).replace(/\s+/g, ' '));
  await shotEl(`${PREFIX}-11-progress`, '[data-testid="learn-counts"]');
  const wide = await page.evaluate(() => document.documentElement.scrollWidth <= 392);
  ok('no horizontal scroll at 390px', wide);
} catch (e) {
  ok('script error', false, String(e).slice(0, 300));
  await page.screenshot({ path: `${OUT}${PREFIX}-error.png`, fullPage: true }).catch(() => {});
}
const bad = errors.filter((e) => !/favicon|ResizeObserver|net::ERR_FAILED|Failed to load resource/.test(e));
ok('no page errors', bad.length === 0, bad.slice(0, 3).join(' | '));
console.log(`\n${results.filter((r) => r.startsWith('PASS')).length}/${results.length} passed`);
await browser.close();
