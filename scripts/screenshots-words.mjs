// Words session (Word of the day) walkthrough: 5 words, 4 steps each (Hear it, Notice it, Say it, Use it).
// Usage: TEST_EMAIL=... TEST_PASSWORD=... node --experimental-strip-types scripts/screenshots-words.mjs  (demo -> 97-*; REAL=1 [WAV=...] -> 98-*)
import puppeteer from 'puppeteer-core';
import { CATALOGUE } from '../src/lib/topics.ts';
const norm = (q) => q.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const BANK = new Set(CATALOGUE.flatMap((c) => c.questions.map((q) => norm(q.text))));

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const REAL = process.env.REAL === '1';
const WAV = process.env.WAV || '';
const PREFIX = process.env.PREFIX || (REAL ? '98' : '97');
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
const card = () => page.evaluate(() => { const c = document.querySelector('[data-testid="word-card"]'); return c ? { phrase: c.dataset.phrase, step: Number(c.dataset.step) } : null; });
const clickSel = async (sel, i = 0) => {
  await page.waitForSelector(sel, { timeout: 30000 });
  await page.evaluate((s, n) => { const all = [...document.querySelectorAll(s)].filter((b) => !b.disabled); const b = n < 0 ? all.at(-1) : all[n]; b.scrollIntoView({ block: 'center' }); b.click(); }, sel, i);
  await sleep(350);
};
const waitStep = (n) => page.waitForFunction((x) => document.querySelector('[data-testid="word-card"]')?.dataset.step === String(x), { timeout: 20000 }, n);

try {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate((real) => { localStorage.clear(); if (!real) localStorage.setItem('speakup.demo', '1'); localStorage.setItem('speakup.listen', JSON.stringify({ accent: 'UK' })); }, REAL);
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

  // 0) Entry points: Words tab in the nav + Word of the day card on Phrases
  const navHas = await page.evaluate(() => [...document.querySelectorAll('nav a')].some((a) => a.getAttribute('href') === '/words'));
  await page.goto(`${BASE}/phrases`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="word-of-the-day"]', { timeout: 30000 });
  await shotEl(`${PREFIX}-6-phrases-card`, '[data-testid="word-of-the-day"]');
  ok('Words tab + "Word of the day" card on Phrases', navHas && /Word of the day/.test(await T('[data-testid="word-of-the-day"]')));
  await page.evaluate(() => document.querySelector('[data-testid="word-of-the-day"]').click());
  await page.waitForSelector('[data-testid="word-card"]', { timeout: 60000 });
  const dots = await page.evaluate(() => document.querySelectorAll('[data-testid="word-dots"] button').length);
  ok('5 words picked for today', dots === 5, (await T('h1')) + ' · ' + (await page.evaluate(() => document.querySelector('[data-testid="word-dots"]').innerText.replace(/\s+/g, ' '))));

  const words = [];
  for (let i = 0; i < 5; i++) {
    const c = await card();
    words.push(c.phrase);
    // 1) Hear it: 2 example sentences, auto-played
    await waitStep(1);
    const ex = await page.evaluate(() => [...document.querySelectorAll('[data-testid="hear-it"] p.text-slate-800')].map((p) => p.innerText));
    if (i === 0) {
      if (REAL) await page.waitForFunction(() => document.querySelector('[data-testid="play-both"]')?.dataset.state === 'idle', { timeout: 90000 }).catch(() => {});
      else await sleep(1200);
      const spoken = REAL ? tts.filter((s) => s === 200).length : await page.evaluate((e) => window.__spoken.filter((x) => e.includes(x.text)).length, ex);
      ok('Hear it: 2 example sentences, played automatically', ex.length === 2 && spoken >= 2, `${c.phrase}: ${REAL ? `tts ${tts.join(',')}` : `${spoken} spoken`}`);
      await shotEl(`${PREFIX}-1-hear-it`, '[data-testid="word-card"]');
    }
    await clickSel('[data-testid="next-step"]');
    // 2) Notice it
    await waitStep(2);
    const notice = await T('[data-testid="notice-it"]');
    if (i === 0) {
      ok('Notice it: meaning, Vietnamese hint, collocations, wrong pair', /Meaning:/.test(notice) && /🇻🇳/.test(notice) && /Goes with:/.test(notice), notice.replace(/\s+/g, ' ').slice(0, 160));
      await shotEl(`${PREFIX}-2-notice-it`, '[data-testid="word-card"]');
    }
    if (i === 0) ok('wrong pair shown when the word has one', (await page.$('[data-testid="wrong-pair"]')) ? /Not:/.test(notice) : true);
    await clickSel('[data-testid="next-step"]');
    // 3) Say it: shadowing (+ pronunciation check) and a quick cloze
    await waitStep(3);
    if (i === 0) {
      await page.evaluate((s) => window.__speechPlans.push([[300, 1200, s]]), ex[0]);
      await clickText('Listen & repeat');
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Stop'), { timeout: 20000 });
      await sleep(WAV ? 9000 : 2500);
      await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Stop').click());
      await page.waitForSelector('[data-testid="shadowed"]', { timeout: 20000 }).catch(() => {});
      ok('Say it: shadowing take saved', !!(await page.$('[data-testid="shadowed"]')), (await T('[data-testid="say-it"] .rounded-xl.bg-slate-50')).replace(/\s+/g, ' ').slice(0, 100));
      if (!REAL || WAV) {
        await clickSel('[data-testid="pron-check"]');
        await page.waitForFunction(() => /Check again|couldn't hear/i.test(document.querySelector('[data-testid="say-it"]').innerText), { timeout: 90000 }).catch(() => {});
        const t = await T('[data-testid="say-it"]');
        ok('Say it: pronunciation check runs on the take', /Check again/.test(t), (t.match(/\d+\s*\/\s*100|\b\d{1,3}%/g) || []).slice(0, 2).join(' '));
      }
    }
    const nextDisabled = await page.evaluate(() => [...document.querySelectorAll('[data-testid="next-step"]')].at(-1).disabled);
    const wrong = i === 1;
    await clickSel(`[data-testid="cloze-option"][data-right="${wrong ? 0 : 1}"]`);
    const cr = await T('[data-testid="cloze-result"]');
    if (i === 0) {
      ok('cloze: blanked sentence with 4 options, Next locked until answered', nextDisabled && (await page.$$('[data-testid="cloze-option"]')).length === 4 && /_____|means/.test(await T('[data-testid="cloze"]')), cr);
      await shotEl(`${PREFIX}-3-say-it`, '[data-testid="cloze"]');
    }
    if (wrong) ok('cloze: a wrong pick shows the right phrase', new RegExp(`It.s .${c.phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(cr), cr);
    await clickSel('[data-testid="next-step"]', -1);
    // 4) Use it: answer by voice, graded Natural / Understandable / Off
    await waitStep(4);
    if (i === 2) {
      await speakIntoMic('I usually drink coffee in the morning before work.', 3000);
      await clickSel('[data-testid="check-use"]');
      await page.waitForSelector('[data-testid="use-result"]', { timeout: 90000 });
      const lv = await page.evaluate(() => document.querySelector('[data-testid="use-result"]').dataset.level);
      ok('Use it: a sentence without the word is not graded Natural', lv !== 'natural', lv);
      await clickSel('[data-testid="try-again"]');
    }
    await speakIntoMic(ex[1] || ex[0], 3000);
    await clickSel('[data-testid="check-use"]');
    await page.waitForSelector('[data-testid="use-result"]', { timeout: 90000 });
    const res = await T('[data-testid="use-result"]');
    const level = await page.evaluate(() => document.querySelector('[data-testid="use-result"]').dataset.level);
    if (i === 0) {
      ok('Use it: voice answer graded (Natural/Understandable/Off)', ['natural', 'understandable', 'off'].includes(level), `${level}: ${res.replace(/\s+/g, ' ').slice(0, 140)}`);
      await shotEl(`${PREFIX}-4-use-it`, '[data-testid="word-card"]');
    }
    console.log(`  word ${i + 1}: ${c.phrase} -> ${level}`);
    await clickSel('[data-testid="next-word"]');
    if (i === 0) {
      // Resume: progress is saved; after a reload we land on word 2, step 1
      await sleep(2500);
      await page.reload({ waitUntil: 'networkidle0' });
      await page.waitForSelector('[data-testid="word-card"]', { timeout: 60000 });
      const c2 = await card();
      const doneChip = await page.evaluate(() => document.querySelector('[data-testid="word-dots"] button').innerText);
      ok('progress saved: reload resumes at word 2', c2.phrase !== words[0] && doneChip.includes(words[0]), `${c2.phrase}; ${doneChip}`);
    }
  }
  await page.waitForSelector('[data-testid="words-done"]', { timeout: 20000 });
  await shotEl(`${PREFIX}-5-done`, '[data-testid="words-done"]');
  ok('session done: summary of the 5 words', words.every((w) => true) && (await T('[data-testid="words-done"]')).includes(words[4]));

  // Saved to the Phrase Bank (origin Words) and still done after a reload
  await sleep(3000);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="words-done"]', { timeout: 60000 });
  ok('done state is kept after reload (word_sessions row)', true);
  await page.goto(`${BASE}/phrases`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="word-of-the-day"]');
  ok('Phrases card shows today as done', /Done for today: 5\/5/.test(await T('[data-testid="word-of-the-day"]')), await T('[data-testid="word-of-the-day"]'));
  await clickText('All phrases');
  await sleep(800);
  const all = await page.evaluate(() => document.body.innerText);
  const inBank = words.filter((w) => all.toLowerCase().includes(w.toLowerCase())).length;
  ok('all 5 words are in the Phrase Bank (📚 Words)', inBank === 5 && all.includes('📚 Words'), `${inBank}/5`);

  await page.goto(`${BASE}/words`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="words-done"]');
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  ok('no horizontal scroll at 390px', sw <= 390, String(sw));
  const errs = errors.filter((e) => !/favicon|ERR_ABORTED|status of 4\d\d/.test(e));
  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
  console.log('WORDS ' + JSON.stringify(words));
} catch (e) {
  console.log('ERROR', e.message);
  await page.screenshot({ path: `${OUT}${PREFIX}-error.png`, fullPage: true }).catch(() => {});
  results.push('FAIL crashed: ' + e.message);
}
await browser.close();
const pass = results.filter((r) => r.startsWith('PASS')).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
