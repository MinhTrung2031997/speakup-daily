// "Say it better" from Vietnamese walkthrough: type/say a Vietnamese thought -> 3 versions -> hear -> shadow -> say it your way (graded) -> Phrase Bank -> history.
// Usage: TEST_EMAIL=... TEST_PASSWORD=... node --experimental-strip-types scripts/screenshots-say.mjs  (demo -> 99-*; REAL=1 [WAV=...] -> 100-*)
import puppeteer from 'puppeteer-core';
import { CATALOGUE } from '../src/lib/topics.ts';
const norm = (q) => q.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
const BANK = new Set(CATALOGUE.flatMap((c) => c.questions.map((q) => norm(q.text))));

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const REAL = process.env.REAL === '1';
const WAV = process.env.WAV || '';
const PREFIX = process.env.PREFIX || (REAL ? '100' : '99');
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

const tts = [];
page.on('response', (r) => { if (r.url().includes('/functions/v1/tts')) tts.push(r.status()); });
const T = (s) => page.evaluate((x) => document.querySelector(x)?.innerText || '', s);
const clickSel = async (sel, i = 0) => {
  await page.waitForSelector(sel, { timeout: 30000 });
  await page.evaluate((s, n) => { const all = [...document.querySelectorAll(s)].filter((b) => !b.disabled); const b = n < 0 ? all.at(-1) : all[n]; b.scrollIntoView({ block: 'center' }); b.click(); }, sel, i);
  await sleep(350);
};
const VI = 'Dạo này mình hơi mệt, chắc tại làm nhiều quá';

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

  // 0) Nav entry, then the page (empty history, starters)
  const nav = await page.evaluate(() => [...document.querySelectorAll('nav a')].filter((a) => a.getAttribute('href') === '/say').length);
  await page.evaluate(() => [...document.querySelectorAll('nav a')].find((a) => a.getAttribute('href') === '/say').click());
  await page.waitForSelector('[data-testid="say-composer"]', { timeout: 30000 });
  const starters = (await page.$$('[data-testid="say-starter"]')).length;
  ok('nav entry "Say it" opens the page; empty-state starters shown', nav >= 1 && starters === 4, `${starters} starters`);
  await shotEl(`${PREFIX}-1-composer`, '[data-testid="say-composer"]');
  ok('history is empty at first', /No sessions yet/.test(await T('[data-testid="say-history"]')));
  // mobile bottom nav: every item fits and none overlaps
  const navFit = await page.evaluate(() => {
    const links = [...document.querySelectorAll('nav.fixed a')];
    const rects = links.map((a) => a.getBoundingClientRect());
    return { n: links.length, ok: rects.every((r, i) => r.left >= 0 && r.right <= innerWidth + 0.5 && r.width >= 40 && (i === 0 || r.left >= rects[i - 1].right - 1)), min: Math.round(Math.min(...rects.map((r) => r.width))) };
  });
  ok('bottom nav fits 390px', navFit.ok, `${navFit.n} items, min width ${navFit.min}px`);

  // 1) Starter -> typing; then Vietnamese by voice (vi-VN)
  await clickSel('[data-testid="say-starter"]', 0);
  const filled = await page.evaluate(() => document.querySelector('[data-testid="say-composer"] textarea').value);
  ok('tapping a starter fills the box', filled.length > 10, filled);
  await page.evaluate(() => { const t = document.querySelector('[data-testid="say-composer"] textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, ''); t.dispatchEvent(new Event('input', { bubbles: true })); });
  await speakIntoMic(VI, 3000);
  const typed = await page.evaluate(() => document.querySelector('[data-testid="say-composer"] textarea').value);
  const langs = await page.evaluate(() => window.__srLangs || []);
  ok('mic uses Vietnamese recognition (vi-VN) and fills the box', langs.at(-1) === 'vi-VN' && typed.includes('mệt'), `${langs.at(-1)}: ${typed}`);

  // 2) Generate: understood + trap + 3 versions + tip
  await clickSel('[data-testid="say-go"]');
  await page.waitForSelector('[data-testid="say-flow"]', { timeout: 90000 });
  const nv = (await page.$$('[data-testid="say-version"]')).length;
  const understood = await T('[data-testid="say-understood"]');
  const hasTip = !!(await page.$('[data-testid="say-tip"]'));
  const kp = await page.evaluate(() => [...document.querySelectorAll('[data-testid="say-version"]')].map((v) => ({ en: v.querySelector('p.text-lg').innerText, key: v.querySelector('.chip').innerText })));
  ok('shows what was understood, the tip and 3 versions with a key phrase inside each', nv === 3 && /I understood:/.test(understood) && hasTip && kp.every((v) => v.en.toLowerCase().includes(v.key.toLowerCase())), `${understood.replace(/\s+/g, ' ').slice(0, 120)} | ${kp.map((v) => v.key).join(' / ')}`);
  console.log('  versions:', JSON.stringify(kp));
  await shotEl(`${PREFIX}-2-versions`, '[data-testid="say-flow"]');

  // 3) Pick -> hear it in the natural voice
  const n0 = tts.length;
  await clickSel('[data-testid="say-pick"]', 0);
  if (REAL) await page.waitForFunction(() => document.querySelector('[data-testid="say-play"]')?.dataset.state === 'idle', { timeout: 90000 }).catch(() => {});
  else await sleep(1200);
  const spoken = REAL ? tts.slice(n0).filter((s) => s === 200).length : await page.evaluate((e) => window.__spoken.filter((x) => x.text === e).length, kp[0].en);
  ok('pick a version -> it is played in the natural voice', spoken >= 1 && (await page.$('[data-testid="say-shadow"]')) !== null, REAL ? `tts ${tts.slice(n0).join(',')}` : `${spoken} spoken`);

  // 4) Shadow it + pronunciation check
  await page.evaluate((s) => window.__speechPlans.push([[300, 1200, s]]), kp[0].en);
  await clickText('Listen & repeat');
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Stop'), { timeout: 20000 });
  await sleep(WAV ? 9000 : 2500);
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.innerText.trim() === 'Stop').click());
  await page.waitForSelector('[data-testid="say-shadowed"]', { timeout: 20000 }).catch(() => {});
  ok('shadowing take saved', !!(await page.$('[data-testid="say-shadowed"]')), (await T('[data-testid="say-shadow"] .rounded-xl.bg-slate-50')).replace(/\s+/g, ' ').slice(0, 90));
  if (!REAL || WAV) {
    await clickSel('[data-testid="pron-check"]');
    await page.waitForFunction(() => /Check again|couldn't hear/i.test(document.querySelector('[data-testid="say-shadow"]').innerText), { timeout: 90000 }).catch(() => {});
    ok('pronunciation check runs on the take', /Check again/.test(await T('[data-testid="say-shadow"]')));
  }
  await shotEl(`${PREFIX}-3-shadow`, '[data-testid="say-shadow"]');

  // 5) Own way: first a wrong try (off topic), then a good one
  await speakIntoMic('I really like pizza', 2500, true);
  await clickSel('[data-testid="say-check"]');
  await page.waitForSelector('[data-testid="say-result"]', { timeout: 90000 });
  const lv1 = await page.evaluate(() => document.querySelector('[data-testid="say-result"]').dataset.level);
  ok('an unrelated sentence is not graded Natural', lv1 !== 'natural', lv1);
  await clickSel('[data-testid="say-retry"]');
  await speakIntoMic(`${kp[0].en}`, 3000, true);
  await clickSel('[data-testid="say-check"]');
  await page.waitForSelector('[data-testid="say-result"]', { timeout: 90000 });
  const res = await T('[data-testid="say-result"]');
  const lv2 = await page.evaluate(() => document.querySelector('[data-testid="say-result"]').dataset.level);
  ok('own-way answer graded (Natural/Understandable/Off), phrase saved', ['natural', 'understandable', 'off'].includes(lv2) && /Phrase Bank/.test(res), `${lv2}: ${res.replace(/\s+/g, ' ').slice(0, 140)}`);
  await shotEl(`${PREFIX}-4-own-way`, '[data-testid="say-own"]');

  // 6) Phrase Bank has the key phrase (origin Say it better); history lists the session
  await sleep(2500);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="say-history-item"]', { timeout: 60000 });
  const item = await T('[data-testid="say-history-item"]');
  ok('history lists the session (input, phrase, grade) after reload', item.includes('mệt') && item.toLowerCase().includes(kp[0].key.toLowerCase()), item.replace(/\s+/g, ' ').slice(0, 120));
  await shotEl(`${PREFIX}-5-history`, '[data-testid="say-history"]');
  await clickSel('[data-testid="say-history-item"] button.min-w-0');
  await page.waitForSelector('[data-testid="say-result"]', { timeout: 20000 });
  const reopened = await page.evaluate(() => ({ picked: document.querySelectorAll('[data-testid="say-version"][data-picked="1"]').length, lvl: document.querySelector('[data-testid="say-result"]').dataset.level }));
  ok('reopening a past session restores the picked version and grade', reopened.picked === 1 && reopened.lvl === lv2, JSON.stringify(reopened));
  await page.goto(`${BASE}/phrases`, { waitUntil: 'networkidle0' });
  await clickText('All phrases');
  await sleep(800);
  const bank = await page.evaluate(() => document.body.innerText);
  ok('key phrase is in the Phrase Bank (🗣️ Say it better)', bank.toLowerCase().includes(kp[0].key.toLowerCase()) && bank.includes('Say it better'), kp[0].key);

  // 7) Delete a session with the confirm popup
  await page.goto(`${BASE}/say`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="say-history-item"]');
  await clickSel('[data-testid="say-delete"]');
  const c1 = await confirmDialog(false);
  ok('delete asks first (Cancel keeps it)', /Delete this session/.test(c1.txt) && (await page.$$('[data-testid="say-history-item"]')).length === 1);
  await clickSel('[data-testid="say-delete"]');
  await confirmDialog(true);
  await sleep(2500);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="say-composer"]');
  ok('deleted session is gone after reload; phrase stays in the bank', /No sessions yet/.test(await T('[data-testid="say-history"]')));
  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  ok('no horizontal scroll at 390px', sw <= 390, String(sw));
  const errs = errors.filter((e) => !/favicon|ERR_ABORTED|status of 4\d\d/.test(e));
  ok('no page errors', errs.length === 0, errs.slice(0, 3).join(' | '));
} catch (e) {
  console.log('ERROR', e.message);
  await page.screenshot({ path: `${OUT}${PREFIX}-error.png`, fullPage: true }).catch(() => {});
  results.push('FAIL crashed: ' + e.message);
}
await browser.close();
const pass = results.filter((r) => r.startsWith('PASS')).length;
console.log(`\n${pass}/${results.length} passed`);
process.exit(pass === results.length ? 0 : 1);
