// Answer builder walkthrough + mobile screenshots (390px wide) against the real Supabase project.
// Needs a confirmed throwaway user. Usage:
//   npm run build && npx vite preview --host 127.0.0.1 --port 4173 &
//   TEST_EMAIL=... TEST_PASSWORD=... node scripts/screenshots-builder.mjs          # demo (mock) AI
//   REAL=1 TEST_EMAIL=... TEST_PASSWORD=... node scripts/screenshots-builder.mjs   # real AI via the `ai` Edge Function
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const REAL = process.env.REAL === '1';
const PREFIX = REAL ? '31' : '30';
const { TEST_EMAIL, TEST_PASSWORD } = process.env;
if (!TEST_EMAIL || !TEST_PASSWORD) throw new Error('Set TEST_EMAIL and TEST_PASSWORD');
const OUT = process.env.OUT || new URL('../screenshots/', import.meta.url).pathname;
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
const waitText = (t, timeout = 60000) => page.waitForFunction((x) => document.body.innerText.toLowerCase().includes(x.toLowerCase()), { timeout }, t);
const bodyHas = (t) => page.evaluate((x) => document.body.innerText.toLowerCase().includes(x.toLowerCase()), t);
/** Screenshot of the section whose heading contains `title` (or the whole page). */
const shot = async (name, title) => {
  await sleep(500);
  if (title) {
    // Section shots: keep the sticky header/tab bar from being painted over the section.
    await page.addStyleTag({ content: 'header, nav { position: static !important; }' });
    const box = await page.evaluate((t) => {
      const h = [...document.querySelectorAll('h2, p')].find((x) => x.textContent.includes(t));
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
  await page.evaluate((real) => { localStorage.clear(); if (!real) localStorage.setItem('speakup.demo', '1'); localStorage.setItem('speakup.todayMode', 'builder'); }, REAL);
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('Sign in to keep your practice saved');
  await page.type('#email', TEST_EMAIL);
  await page.type('#password', TEST_PASSWORD);
  await page.click('form button.btn-primary');
  await waitText('Answer builder', 30000);
  if (await bodyHas('We found practice saved')) await clickText('Not now').catch(() => {});
  await waitText('Pick a topic and question type');
  ok('Answer builder tab opens on Today', true);

  // Step 1
  const topic = await page.evaluate(() => {
    const sec = [...document.querySelectorAll('section')].find((s) => s.textContent.includes('Pick a topic and question type'));
    const b = [...sec.querySelectorAll('button')].find((x) => /Work|Tech/i.test(x.textContent)) || sec.querySelector('button');
    b.click();
    return b.textContent;
  });
  await clickText('Is X good or bad?', 'div.grid button');
  await shot(`${PREFIX}-1-topic-type`, 'Pick a topic and question type');
  const t0 = Date.now();
  await clickText('Get a question');
  await waitText('Answer structure:');
  ok('question generated', true, `${topic}, ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  const q1 = await page.evaluate(() => [...document.querySelectorAll('p.text-xl')].map((p) => p.textContent)[0]);
  console.log('Q:', q1);

  // Step 2
  await page.waitForFunction(() => document.querySelector('input[placeholder="✏️ Or type your own idea"]') || document.body.innerText.includes('Try again'), { timeout: 90000 });
  ok('idea chips shown', !!(await page.$('input[placeholder="✏️ Or type your own idea"]')));
  const rows = await page.evaluate(() => {
    const sec = [...document.querySelectorAll('section')].find((s) => s.textContent.includes('Pick your ideas'));
    const groups = [...sec.querySelectorAll('div.flex.flex-wrap.gap-2')];
    groups.forEach((g, i) => { const b = g.querySelectorAll('button')[i % 2]; b && b.click(); });
    return groups.map((g) => [...g.querySelectorAll('button')].map((b) => b.textContent));
  });
  console.log('Ideas:', JSON.stringify(rows));
  // Type one idea of our own in the last row.
  const inputs = await page.$$('input[placeholder="✏️ Or type your own idea"]');
  await inputs[inputs.length - 1].type('Use it, but always check the result');
  ok('every row has ~4 options', rows.length >= 3 && rows.every((r) => r.length >= 3), rows.map((r) => r.length).join('/'));
  await shot(`${PREFIX}-2-ideas`, 'Pick your ideas');

  // Step 3
  await clickText('Natural', 'div.grid button');
  await clickText('45s');
  await shot(`${PREFIX}-3-level-length`, 'Level and length');
  const t1 = Date.now();
  await clickText('Build my answer');
  await waitText('Your model answer', 90000);
  ok('model answer built', true, `${((Date.now() - t1) / 1000).toFixed(1)}s`);
  const parts = await page.evaluate(() => {
    const sec = [...document.querySelectorAll('section')].find((s) => s.textContent.includes('Your model answer'));
    return [...sec.querySelectorAll('.chip')].map((c) => c.textContent);
  });
  ok('answer parts labelled', parts.length >= 3, parts.join(' | '));
  const marks = await page.evaluate(() => document.querySelectorAll('mark.mark-phrase').length);
  ok('phrases highlighted in the answer', marks >= 2, `${marks} highlights`);
  await shot(`${PREFIX}-4-model-answer`, 'Your model answer');

  // Save one phrase, then all
  const toSave = await page.evaluate(() => {
    const b = document.querySelector('button[title="Save to Phrase Bank"]');
    const name = b?.closest('div.flex')?.querySelector('p')?.textContent.replace(/"/g, '') || '';
    b?.click();
    return name;
  });
  await page.waitForFunction(() => /Saved \d phrase|Already in your Phrase Bank/.test(document.body.innerText), { timeout: 10000 });
  ok('one-tap phrase save', true, toSave);
  await shot(`${PREFIX}-4b-phrases`, 'Phrases to steal');
  ok('listen + shadowing available', (await bodyHas('Listen')) && (await bodyHas('Start shadowing')));

  // Step 5: say it your way (fake mic)
  await clickText('Hide answer & try');
  await waitText('Try to use:');
  const targets = await page.evaluate(() => [...document.querySelectorAll('span.chip')].filter((s) => s.parentElement.textContent.includes('Try to use:')).map((s) => s.textContent));
  const said = `uhm honestly I think ${targets[0] || 'the thing is'} it saves time and ${targets[1] || 'at the end of the day'} you still need to check the code`;
  await page.evaluate((s) => window.__speechPlans.push([[600, 3000, s.split(' ').slice(0, 8).join(' ')], [2500, 3000, s.split(' ').slice(8).join(' ')]]), said);
  await page.click('button[title="Answer by voice"]');
  await sleep(10000);
  await page.click('button[title="Stop recording"]');
  await sleep(600);
  ok('fluency shown for the try', await bodyHas('Fluency (this try)'));
  ok('Check pronunciation offered after recording (not automatic)', !!(await page.$('[data-testid="pron-check"]')) && !(await page.$('[data-testid="pron-score"]')));
  { const tp = Date.now(); await page.evaluate(() => { const b = document.querySelector('[data-testid="pron-check"]'); b.scrollIntoView({ block: 'center' }); b.click(); });
    await page.waitForSelector('[data-testid="pron-score"]', { timeout: 150000 });
    ok('pronunciation checked', true, `${((Date.now() - tp) / 1000).toFixed(1)}s`); }
  const t2 = Date.now();
  await clickText('Check my answer');
  await waitText('target phrases used', 90000);
  ok('attempt scored', true, `${((Date.now() - t2) / 1000).toFixed(1)}s`);
  ok('pronunciation saved with the builder try', await bodyHas('Pronunciation (your try)') && !!(await page.$('[data-testid="pron-score"]')));
  await shot(`${PREFIX}-5-say-it-your-way`, 'Say it your way');
  await sleep(4000); // let the background save finish

  // History (after reload, from the database)
  await page.goto(`${BASE}/history`, { waitUntil: 'networkidle0' });
  await waitText('Builder', 20000);
  ok('builder attempt saved to History', true);
  await clickText(q1.slice(0, 30), 'button');
  await waitText('Your model answer');
  ok('History shows model answer with parts', await bodyHas('Say it your way:'));
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot(`${PREFIX}-6-history`);

  // Phrase bank has the saved phrase
  await page.goto(`${BASE}/phrases`, { waitUntil: 'networkidle0' });
  await clickText('All phrases').catch(() => {});
  await sleep(1500);
  ok('saved phrase in Phrase Bank', !!toSave && await page.evaluate((p) => document.body.innerText.toLowerCase().includes(p.toLowerCase()), toSave), toSave);

  // The daily question flow still works
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await clickText('Daily question');
  await page.waitForFunction(() => /Idea starters|Get today's question|Your answer/.test(document.body.innerText), { timeout: 60000 });
  ok('daily question mode still renders', true);
} catch (e) {
  ok('unexpected error', false, String(e));
  await page.screenshot({ path: `/tmp/builder-fail-${PREFIX}.png`, fullPage: true }).catch(() => {});
}
const real = errors.filter((e) => !/favicon|Failed to load resource: the server responded with a status of (400|401)/.test(e));
console.log(real.length ? `PAGE ERRORS:\n${real.join('\n')}` : 'No page errors');
console.log(results.filter((r) => r.startsWith('FAIL')).length ? 'SOME TESTS FAILED' : 'ALL PASSED');
await browser.close();
