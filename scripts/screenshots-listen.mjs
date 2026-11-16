// Listen tab walkthrough + mobile screenshots (390px wide) against the real Supabase project.
// Needs a confirmed throwaway user. Usage:
//   npm run build && npx vite preview --host 127.0.0.1 --port 4173 &
//   TEST_EMAIL=... TEST_PASSWORD=... node scripts/screenshots-listen.mjs          # demo (mock) AI -> screenshots/40-*
//   REAL=1 TEST_EMAIL=... TEST_PASSWORD=... node scripts/screenshots-listen.mjs   # real AI -> screenshots/41-*
// speechSynthesis is replaced by a fake (headless Chrome has no voices) that records what was spoken.
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const REAL = process.env.REAL === '1';
const PREFIX = process.env.PREFIX || (REAL ? '41' : '40');
const OUT = process.env.OUT || new URL('../screenshots/', import.meta.url).pathname;
const { TEST_EMAIL, TEST_PASSWORD } = process.env;
if (!TEST_EMAIL || !TEST_PASSWORD) throw new Error('Set TEST_EMAIL and TEST_PASSWORD');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME || '/usr/bin/google-chrome',
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept());
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

await page.evaluateOnNewDocument(() => {
  // Fake voices: two US, one GB, one AU.
  const voices = [
    { name: 'Fake US Joanna', lang: 'en-US', voiceURI: 'us1', default: true, localService: true },
    { name: 'Fake US Matthew', lang: 'en-US', voiceURI: 'us2', default: false, localService: true },
    { name: 'Fake UK Amy', lang: 'en-GB', voiceURI: 'gb1', default: false, localService: true },
    { name: 'Fake AU Nicole', lang: 'en-AU', voiceURI: 'au1', default: false, localService: true },
  ];
  window.__spoken = [];
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; this.rate = 1; this.pitch = 1; } };
  let timers = [];
  const synth = {
    speak(u) { window.__spoken.push({ text: u.text, voice: u.voice?.name, lang: u.lang, rate: u.rate, pitch: u.pitch }); timers.push(setTimeout(() => u.onend && u.onend(), 120)); },
    cancel() { timers.forEach(clearTimeout); timers = []; },
    getVoices: () => voices,
    addEventListener() {}, removeEventListener() {},
    speaking: false, pending: false, paused: false,
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  // Fake speech recognition
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
const spoken = () => page.evaluate(() => window.__spoken);
const shot = async (name, title) => {
  await sleep(500);
  await page.addStyleTag({ content: 'header, nav { position: static !important; }' });
  if (title) {
    const box = await page.evaluate((t) => {
      const h = [...document.querySelectorAll('h2')].find((x) => x.textContent.includes(t));
      const el = h?.closest('section');
      if (!el) return null;
      el.scrollIntoView({ block: 'start' });
      const r = el.getBoundingClientRect();
      return { x: 0, y: r.top + window.scrollY - 8, width: window.innerWidth, height: r.height + 16 };
    }, title);
    if (box) { await page.screenshot({ path: `${OUT}${name}.png`, clip: box, captureBeyondViewport: true }); console.log('saved', name); return; }
  }
  await page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
  console.log('saved', name);
};

try {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate((real) => { localStorage.clear(); if (!real) localStorage.setItem('speakup.demo', '1'); }, REAL);
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('Sign in to keep your practice saved', 30000);
  await page.type('#email', TEST_EMAIL);
  await page.type('#password', TEST_PASSWORD);
  await page.click('form button.btn-primary');
  await page.waitForFunction(() => !document.body.innerText.includes('Sign in to keep your practice saved'), { timeout: 30000 });
  await page.waitForFunction(() => [...document.querySelectorAll('nav a')].some((a) => a.textContent.includes('Listen')), { timeout: 30000 });
  await sleep(500);
  if (await bodyHas('We found practice saved')) await clickText('Not now').catch(() => {});

  // Nav entry
  await clickText('Listen', 'nav a');
  await waitText('Set up your drill');
  ok('Listen tab in the nav opens the page', true);

  // 1. Setup: topic, UK accent, 1.25x; check the choices are remembered after reload
  await page.evaluate(() => {
    const sec = [...document.querySelectorAll('section')].find((s) => s.textContent.includes('Set up your drill'));
    const b = [...sec.querySelectorAll('button')].find((x) => /Work|Tech/i.test(x.textContent)) || sec.querySelector('button');
    b.click();
  });
  await clickText('🇬🇧 UK');
  await clickText('1.25x');
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('Set up your drill');
  const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('speakup.listen') || '{}'));
  const uiKeeps = await page.evaluate(() => [...document.querySelectorAll('button')].filter((b) => b.className.includes('bg-blue-600') && /UK|1\.25x/.test(b.textContent)).length === 2);
  ok('accent/speed/topic remembered on this device', prefs.accent === 'UK' && prefs.speed === 1.25 && !!prefs.topic && uiKeeps, JSON.stringify(prefs));
  await shot(`${PREFIX}-1-setup`, 'Set up your drill');

  const t0 = Date.now();
  await clickText('Start listening');
  await waitText('Listen and answer');
  ok('drill generated', true, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const info = await page.evaluate(() => {
    const sec = [...document.querySelectorAll('section')].find((s) => s.textContent.includes('Listen and answer'));
    return { qs: sec.querySelectorAll('p.text-sm.font-semibold').length, opts: sec.querySelectorAll('div.grid button').length, lines: (sec.textContent.match(/(\d+) lines/) || [])[1] };
  });
  ok('3 multiple-choice questions shown', info.qs === 3 && info.opts >= 9, `${info.qs} questions, ${info.opts} options, ${info.lines} lines`);
  ok('dialogue text hidden on first listen', !(await bodyHas('Replay slowly with the text')));

  // 2. Play the dialogue (two voices, UK, 1.25x)
  await clickText('Play dialogue');
  await page.waitForFunction(() => document.body.innerText.includes('Play again'), { timeout: 60000 });
  const sp = await spoken();
  const lines = Number(info.lines);
  const voicesUsed = [...new Set(sp.map((s) => s.voice))];
  ok('dialogue played line by line', sp.length === lines, `${sp.length}/${lines} lines`);
  ok('two distinct voices, UK first', voicesUsed.length === 2 && sp[0].voice === 'Fake UK Amy', voicesUsed.join(' + '));
  ok('played at the chosen speed (1.25x)', sp.every((s) => s.rate === 1.25));
  await shot(`${PREFIX}-2-listen`, 'Listen and answer');

  // Answer: first option each (may be right or wrong), then check
  await page.evaluate(() => {
    const sec = [...document.querySelectorAll('section')].find((s) => s.textContent.includes('Listen and answer'));
    sec.querySelectorAll('div.grid').forEach((g) => g.querySelector('button').click());
  });
  await clickText('Check answers');
  await waitText('correct');
  const qres = await page.evaluate(() => (document.body.innerText.match(/(\d)\/3 correct/) || [])[0]);
  ok('questions scored', !!qres, qres);
  await shot(`${PREFIX}-3-questions`, 'Listen and answer');

  // 3. Replay slowly with text
  await waitText('Replay slowly with the text');
  const before = (await spoken()).length;
  await clickText('Replay at 0.8x');
  await page.waitForFunction((n, l) => window.__spoken.length >= n + l, { timeout: 60000 }, before, lines);
  await sleep(300);
  const slow = (await spoken()).slice(before);
  ok('replay at 0.8x with text shown', slow.every((s) => s.rate === 0.8) && (await bodyHas('Alex')), `${slow.length} lines`);
  const b2 = (await spoken()).length;
  await page.click('button[aria-label="Play line 3"]');
  await sleep(600);
  const single = (await spoken()).slice(b2);
  ok('single line replay', single.length === 1, single[0]?.text?.slice(0, 40));
  const toSave = await page.evaluate(() => {
    const b = document.querySelector('button[title="Save to Phrase Bank"]');
    const name = b?.closest('div.flex')?.querySelector('p')?.textContent.replace(/"/g, '') || '';
    b?.click();
    return name;
  });
  await page.waitForFunction(() => /Saved \d phrase|Already in your Phrase Bank/.test(document.body.innerText), { timeout: 10000 });
  ok('one-tap phrase save', !!toSave, toSave);
  const marks = await page.evaluate(() => document.querySelectorAll('mark.mark-phrase').length);
  ok('phrases highlighted in the dialogue', marks >= 2, `${marks}`);
  await shot(`${PREFIX}-4-replay`, 'Replay slowly with the text');

  // 4. Dictation: 3 plays max
  const b3 = (await spoken()).length;
  const dictSection = () => page.evaluate(() => {
    const sec = [...document.querySelectorAll('section')].find((x) => x.querySelector('h2')?.textContent.includes('Dictation'));
    const b = [...sec.querySelectorAll('button')].find((x) => /Play/.test(x.textContent));
    if (b && !b.disabled) { b.click(); return true; }
    return false;
  });
  for (let i = 0; i < 4; i++) { await dictSection(); await sleep(400); }
  const dictation = (await spoken()).slice(b3).map((s) => s.text);
  const playBtnDisabled = await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => b.textContent.includes('Play again') && b.closest('section')?.textContent.includes('Dictation'))?.disabled);
  ok('dictation plays up to 3 times', dictation.length === 3 && new Set(dictation).size === 1 && playBtnDisabled === true, dictation[0]);
  const words = dictation[0].split(/\s+/);
  const typed = [...words.slice(0, 1), ...words.slice(2, -1), 'xyz.'].join(' '); // one missed word, one wrong word
  await page.type('textarea[placeholder="Type the sentence you heard…"]', typed);
  await page.evaluate(() => {
    const sec = [...document.querySelectorAll('section')].find((x) => x.querySelector('h2')?.textContent.includes('Dictation'));
    [...sec.querySelectorAll('button')].find((x) => x.textContent.includes('Check')).click();
  });
  await waitText('of the words correct');
  const acc = await page.evaluate(() => Number((document.body.innerText.match(/(\d+)% of the words correct/) || [])[1]));
  const colors = await page.evaluate(() => ({ red: document.querySelectorAll('span.bg-rose-100').length, orange: document.querySelectorAll('span.bg-orange-100').length }));
  ok('dictation diff: missed red, wrong orange', colors.red >= 2 && colors.orange >= 1, `accuracy ${acc}%, red ${colors.red}, orange ${colors.orange}`);
  await shot(`${PREFIX}-5-dictation`, 'Dictation');

  // 5. Retell with 60s timer and the fake mic
  await clickText('Start 60s retell');
  await waitText('0:5');
  ok('60s timer running', true);
  const lineTexts = await page.evaluate(() => [...document.querySelectorAll('ol li p')].map((p) => p.textContent.replace(/^(Alex|Sam)/, '')));
  const phrase = toSave || 'a ton of time';
  const retell = `uhm so Alex and Sam were talking about ${lineTexts[0].split(' ').slice(2, 9).join(' ')} and Alex said ${lineTexts[2].split(' ').slice(0, 8).join(' ')} ${phrase} and Sam said ${lineTexts[5].split(' ').slice(0, 8).join(' ')}`;
  await page.evaluate((s) => { const w = s.split(' '); window.__speechPlans.push([[600, 3000, w.slice(0, 12).join(' ')], [2500, 3000, w.slice(12).join(' ')]]); }, retell);
  await page.click('button[title="Answer by voice"]');
  await sleep(10000);
  await page.click('button[title="Stop recording"]');
  await sleep(600);
  ok('retell fluency shown', await bodyHas('Fluency (this retell)'));
  const t1 = Date.now();
  await clickText('Score my retell');
  await waitText('key ideas');
  ok('retell scored', true, `${((Date.now() - t1) / 1000).toFixed(1)}s`);
  ok('model retell with Listen + shadowing', (await bodyHas('Model retell')) && (await bodyHas('Shadow the model retell')));
  const rs = await page.evaluate(() => (document.body.innerText.match(/(\d+)\/(\d+) key ideas[^\n]*/) || [''])[0]);
  console.log('Retell:', rs);
  await shot(`${PREFIX}-6-retell`, 'Retell it in 60 seconds');
  await sleep(4000); // let saves finish

  // History + Progress (fresh load from the database)
  await page.goto(`${BASE}/history`, { waitUntil: 'networkidle0' });
  await clickText('Listening');
  await page.waitForFunction(() => document.body.innerText.includes('🎧'), { timeout: 20000 });
  ok('drill saved and shown in History', (await bodyHas('Retell')) && (await bodyHas('✍️')));
  await page.evaluate(() => document.querySelector('details summary')?.click());
  await shot(`${PREFIX}-7-history`);
  await page.goto(`${BASE}/progress`, { waitUntil: 'networkidle0' });
  await waitText('Dictation accuracy');
  ok('Progress shows dictation accuracy', (await bodyHas('dictation (last 5)')) && !(await bodyHas('Do a dictation on the Listen tab')));
  await shot(`${PREFIX}-8-progress`, 'Listening');
  ok('streak counts today', await bodyHas("You've practised today"));
  await page.goto(`${BASE}/phrases`, { waitUntil: 'networkidle0' });
  await clickText('All phrases').catch(() => {});
  await sleep(800);
  ok('saved phrase in Phrase Bank', await bodyHas(toSave), toSave);
} catch (e) {
  ok('unexpected error', false, String(e));
  await page.screenshot({ path: `/tmp/listen-fail-${PREFIX}.png`, fullPage: true }).catch(() => {});
}
const real = errors.filter((e) => !/favicon|Failed to load resource: the server responded with a status of (400|401)/.test(e));
console.log(real.length ? `PAGE ERRORS:\n${real.join('\n')}` : 'No page errors');
console.log(results.filter((r) => r.startsWith('FAIL')).length ? 'SOME TESTS FAILED' : 'ALL PASSED');
await browser.close();
