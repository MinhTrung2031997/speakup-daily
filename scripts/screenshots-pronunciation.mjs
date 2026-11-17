// Pronunciation check walkthrough + mobile screenshots (390px wide) against the real Supabase project.
// Needs a confirmed throwaway user. Usage:
//   npm run build && npx vite preview --host 127.0.0.1 --port 4173 &
//   TEST_EMAIL=... TEST_PASSWORD=... node scripts/screenshots-pronunciation.mjs                    # demo (mock) AI -> screenshots/50-*
//   REAL=1 WAV=/tmp/pron_test.wav TEST_EMAIL=... TEST_PASSWORD=... node scripts/screenshots-pronunciation.mjs
//        # real AI -> screenshots/51-*; the WAV is fed into Chrome's fake microphone, so Gemini hears real speech.
// Speech recognition and speechSynthesis are faked (headless Chrome has neither); MediaRecorder records the fake mic.
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const REAL = process.env.REAL === '1';
const WAV = process.env.WAV || '';
const PREFIX = process.env.PREFIX || (REAL ? '51' : '50');
const OUT = process.env.OUT || new URL('../screenshots/', import.meta.url).pathname;
const { TEST_EMAIL, TEST_PASSWORD } = process.env;
if (!TEST_EMAIL || !TEST_PASSWORD) throw new Error('Set TEST_EMAIL and TEST_PASSWORD');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// What the test clip says (with planted slips: "ask" for asked, "tree" for three, "tink" for think)
// and what Chrome's recogniser would type (it drops fillers and auto-corrects).
const SAID = 'so I work as a developer last month I asked my team about the three things we think matter it was really useful';
const CLIP_MS = WAV ? 18000 : 4000;

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
  const voices = [{ name: 'Fake US Joanna', lang: 'en-US', voiceURI: 'us1', default: true, localService: true }];
  window.__spoken = [];
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; this.rate = 1; this.pitch = 1; } };
  let timers = [];
  const synth = {
    speak(u) { window.__spoken.push({ text: u.text, rate: u.rate }); timers.push(setTimeout(() => u.onend && u.onend(), 150)); },
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
const speakIntoMic = async (text, ms = CLIP_MS) => {
  await page.evaluate((s, d) => window.__speechPlans.push([[400, Math.max(600, d - 1200), s]]), text, ms);
  await page.click('button[title="Answer by voice"]');
  await sleep(ms);
  await page.click('button[title="Stop recording"]');
  await sleep(800);
};

const runCheck = async (label, index = 0) => {
  const t = Date.now();
  await page.evaluate((i) => { const b = document.querySelectorAll('[data-testid="pron-check"]')[i]; b.scrollIntoView({ block: 'center' }); b.click(); }, index);
  await page.waitForFunction((i) => document.querySelectorAll('[data-testid="pronunciation"]')[i]?.querySelector('[data-testid="pron-score"]') || document.querySelectorAll('[data-testid="pronunciation"]')[i]?.textContent.includes('Try again'), { timeout: 150000 }, index);
  timings[label] = ((Date.now() - t) / 1000).toFixed(1) + 's';
  return page.evaluate((i) => {
    const card = document.querySelectorAll('[data-testid="pronunciation"]')[i];
    return {
      score: Number(card.querySelector('[data-testid="pron-score"]')?.textContent.replace(/\/100/, '')),
      words: [...card.querySelectorAll('[data-testid="pron-word"]')].map((w) => w.textContent.trim()),
      transcript: card.querySelector('[data-testid="pron-transcript"]')?.textContent || '',
      text: card.innerText,
    };
  }, index);
};

try {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate((real) => { localStorage.clear(); if (!real) localStorage.setItem('speakup.demo', '1'); localStorage.setItem('speakup.todayMode', 'daily'); }, REAL);
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('Sign in to keep your practice saved', 30000);
  await page.type('#email', TEST_EMAIL);
  await page.type('#password', TEST_PASSWORD);
  await page.click('form button.btn-primary');
  await page.waitForFunction(() => !document.body.innerText.includes('Sign in to keep your practice saved'), { timeout: 30000 });
  await sleep(800);
  if (await bodyHas('We found practice saved')) await clickText('Not now').catch(() => {});
  await page.waitForFunction(() => document.body.innerText.includes('Your answer') || document.body.innerText.includes("Get today's question"), { timeout: 90000 });
  if (!(await bodyHas('Your answer'))) { await clickText("Get today's question"); await waitText('Your answer'); }
  const question = await page.evaluate(() => document.querySelector('p.text-xl')?.textContent || '');
  ok('daily question ready', !!question, question.slice(0, 60));
  // Start from an empty answer box (the throwaway account may already have an answer for today).
  await page.evaluate(() => document.querySelector('textarea').scrollIntoView({ block: 'center' }));
  await page.click('textarea', { clickCount: 3 });
  await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control');
  await page.keyboard.press('Backspace');
  await sleep(300);

  // 1. Record an answer: no automatic check, a "Check pronunciation" button appears.
  ok('no pronunciation card before recording', !(await page.$('[data-testid="pronunciation"]')));
  await speakIntoMic(SAID);
  await page.waitForSelector('[data-testid="pron-check"]', { timeout: 10000 });
  ok('"Check pronunciation" button after recording (not automatic)', !(await page.$('[data-testid="pron-score"]')));
  const fluBefore = await page.evaluate(() => document.querySelector('[data-testid="fluency"]')?.innerText || '');
  await shotEl(`${PREFIX}-1-check-button`, '[data-testid="pronunciation"]');

  // 2. Run the check.
  const r1 = await runCheck('answer');
  console.log('Result:', JSON.stringify({ score: r1.score, words: r1.words, transcript: r1.transcript.slice(0, 200) }));
  ok('pronunciation score shown', r1.score >= 0 && r1.score <= 100 && !Number.isNaN(r1.score), `${r1.score}/100 in ${timings.answer}`);
  ok('1–5 problem words underlined in the transcript', r1.words.length >= 1 && r1.words.length <= 5, r1.words.join(', '));
  ok('rhythm tip + well done shown', /Rhythm:/.test(r1.text) && r1.text.includes('👏'));
  const flu = await page.evaluate(() => document.querySelector('[data-testid="fluency"]')?.innerText || '');
  ok('fluency card switched to audio counts', flu.includes('from audio'), flu.replace(/\n/g, ' ').slice(0, 160));
  if (REAL) {
    const fillers = Number((flu.match(/FILLERS\s*(\d+)/i) || [])[1]);
    const pauses = Number((flu.match(/LONG PAUSES\s*(\d+)/i) || [])[1]);
    ok('Gemini heard the planted fillers (um, uh, you know, like)', fillers >= 3, `fillers ${fillers}; Chrome-only card said: ${fluBefore.replace(/\n/g, ' ').slice(0, 80)}`);
    ok('two long pauses (>1.5s) measured from the audio', pauses === 2, `pauses ${pauses}`);
    // Underlines may show the heard spelling ("tree"); the panel shows the target word ("three").
    const targets = [];
    for (let i = 0; i < r1.words.length; i++) {
      await page.evaluate((k) => document.querySelectorAll('[data-testid="pron-word"]')[k].click(), i);
      await sleep(250);
      targets.push(await page.$eval('[data-testid="pron-panel"] span.text-lg', (e) => e.textContent.toLowerCase()).catch(() => ''));
      await page.evaluate((k) => document.querySelectorAll('[data-testid="pron-word"]')[k].click(), i);
    }
    const planted = ['asked', 'three', 'think', 'things'].filter((w) => targets.includes(w));
    ok('planted slips found (asked / three / think / things)', planted.length >= 2, `targets: ${targets.join(', ')}`);
  }
  await shotEl(`${PREFIX}-2-result`, '[data-testid="pronunciation"]');

  // 3. Tap a word: plays the target, shows the note, mic retry for that word.
  const word = r1.words[0];
  const before = await page.evaluate(() => window.__spoken.length);
  await page.evaluate(() => document.querySelector('[data-testid="pron-word"]').click());
  await page.waitForSelector('[data-testid="pron-panel"]', { timeout: 5000 });
  const said = await page.evaluate((n) => window.__spoken.slice(n).map((s) => s.text), before);
  ok('tapping a word plays it with speechSynthesis', said.some((s) => s.toLowerCase() === word.toLowerCase()), said.join(' | '));
  await page.evaluate((w) => window.__speechPlans.push([[200, 500, w]]), word);
  await page.click('[data-testid="pron-panel"] [data-testid="word-try"]');
  await page.waitForSelector('[data-testid="word-try-result"]', { timeout: 10000 });
  const tryRes = await page.$eval('[data-testid="word-try-result"]', (e) => e.textContent);
  ok('word retry scored by speech recognition', tryRes.includes('Clear'), tryRes);
  await shotEl(`${PREFIX}-3-word`, '[data-testid="pronunciation"]');

  // 4. Upgrade -> the check is stored with the answer (answers.pronunciation).
  const tu = Date.now();
  await clickText('Upgrade ');
  await page.waitForFunction(() => /Saved \d+ new phrase|already in your Phrase Bank/i.test(document.body.innerText), { timeout: 150000 });
  timings.upgrade = ((Date.now() - tu) / 1000).toFixed(1) + 's';
  await sleep(4000);
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="pron-score"]', { timeout: 30000 }).catch(() => {});
  const kept = await page.$eval('[data-testid="pron-score"]', (e) => e.textContent).catch(() => '');
  ok('pronunciation result saved with the answer (after reload)', !!kept && kept.startsWith(String(r1.score)), kept);

  // 5. "Say it again": button appears after recording the retry too.
  await clickText('Hide answer & try again');
  await waitText('Try to use:');
  await speakIntoMic(SAID);
  const retryBtn = await page.$$eval('[data-testid="pron-check"]', (b) => b.length);
  ok('"Check pronunciation" offered for the retry', retryBtn >= 1);

  // 6. Shadowing a sentence: check one take.
  await clickText('Show answer');
  await clickText('Start shadowing');
  await waitText('Sentence 1 of');
  await page.evaluate(() => window.__speechPlans.push([[300, 1500, 'Honestly I would say']]));
  await clickText('Listen & repeat');
  await page.waitForFunction(() => document.body.innerText.includes('Recording… say the sentence'), { timeout: 20000 });
  await sleep(WAV ? 6000 : 2500);
  await clickText('Stop');
  await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="pronunciation"]')].some((c) => c.textContent.includes('this take')), { timeout: 15000 });
  const idx = await page.evaluate(() => [...document.querySelectorAll('[data-testid="pronunciation"]')].findIndex((c) => c.textContent.includes('this take')));
  const btnIdx = await page.evaluate((i) => { const cards = [...document.querySelectorAll('[data-testid="pronunciation"]')]; return cards.slice(0, i).filter((c) => c.querySelector('[data-testid="pron-check"]')).length; }, idx);
  ok('shadowing take offers a pronunciation check', true);
  const tS = Date.now();
  await page.evaluate((i) => { const b = document.querySelectorAll('[data-testid="pron-check"]')[i]; b.scrollIntoView({ block: 'center' }); b.click(); }, btnIdx);
  await page.waitForFunction((i) => document.querySelectorAll('[data-testid="pronunciation"]')[i]?.querySelector('[data-testid="pron-score"]'), { timeout: 150000 }, idx);
  timings.shadowing = ((Date.now() - tS) / 1000).toFixed(1) + 's';
  ok('shadowing take checked', true, timings.shadowing);
  await shotEl(`${PREFIX}-4-shadowing`, '[data-testid="shadowing"]');
  await sleep(4000); // let saves finish

  // 7. Sounds to fix (Phrase Bank review)
  await page.goto(`${BASE}/phrases#sounds`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="sounds"]', { timeout: 20000 });
  const due = await page.$eval('[data-testid="sounds"]', (e) => e.innerText);
  ok('problem words saved to "Sounds to fix"', /\d+ due/.test(due) && !!(await page.$('[data-testid="sound-card"]')), (due.match(/\d+ due/) || [])[0]);
  const w2 = await page.$eval('[data-testid="sound-card"] p.text-3xl', (e) => e.textContent);
  await page.evaluate((w) => window.__speechPlans.push([[200, 500, w]]), w2);
  await page.click('[data-testid="sound-card"] [data-testid="word-try"]');
  await waitText('Moved to the next review step', 10000);
  const w3 = await page.$eval('[data-testid="sound-card"] p.text-3xl', (e) => e.textContent);
  ok('sound reviewed with the mic and rescheduled (srs)', w3 === w2, w2);
  await shotEl(`${PREFIX}-5-sounds`, '[data-testid="sounds"]');

  // 8. Progress trend
  await sleep(3000);
  await page.goto(`${BASE}/progress`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="pron-trend"]', { timeout: 20000 });
  const trend = await page.$eval('[data-testid="pron-trend"]', (e) => e.innerText.replace(/\n/g, ' '));
  const checks = Number((trend.match(/(\d+) checks/) || [])[1]);
  ok('Progress shows the pronunciation trend (incl. shadowing take from the DB)', checks >= 2 && !trend.includes('to start tracking'), trend.slice(0, 140));
  await shotEl(`${PREFIX}-6-progress`, '[data-testid="pron-trend"]');

  // 9. History shows the saved check
  await page.goto(`${BASE}/history`, { waitUntil: 'networkidle0' });
  await sleep(1500);
  await clickText(question.slice(0, 30), 'button');
  await page.waitForSelector('[data-testid="pron-score"]', { timeout: 10000 }).catch(() => {});
  ok('History shows the pronunciation card', !!(await page.$('[data-testid="pron-score"]')));
} catch (e) {
  ok('unexpected error', false, String(e));
  await page.screenshot({ path: `/tmp/pron-fail-${PREFIX}.png`, fullPage: true }).catch(() => {});
}
console.log('Timings:', JSON.stringify(timings));
const real = errors.filter((e) => !/favicon|Failed to load resource: the server responded with a status of (400|401)/.test(e));
console.log(real.length ? `PAGE ERRORS:\n${real.join('\n')}` : 'No page errors');
console.log(results.filter((r) => r.startsWith('FAIL')).length ? 'SOME TESTS FAILED' : 'ALL PASSED');
await browser.close();
