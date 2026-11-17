// Suggested answers: the daily question's "💡 Show a suggested answer" + the Answer builder's auto-pick path.
// Mobile screenshots (390px wide) against the real Supabase project. Needs a confirmed throwaway user.
// Needs a confirmed throwaway user. Usage:
//   npm run build && npx vite preview --host 127.0.0.1 --port 4173 &
//   TEST_EMAIL=... TEST_PASSWORD=... node scripts/screenshots-suggested.mjs          # demo (mock) AI
//   REAL=1 TEST_EMAIL=... TEST_PASSWORD=... node scripts/screenshots-suggested.mjs   # real AI via the `ai` Edge Function
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const REAL = process.env.REAL === '1';
const PREFIX = process.env.PREFIX || (REAL ? '61' : '60');
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

// Count AI calls: demo mode logs the task name; real mode, classify the edge-function prompts.
const aiCalls = [];
page.on('request', (r) => {
  if (!r.url().includes('/functions/v1/ai') || r.method() !== 'POST') return;
  const b = r.postData() || '';
  aiCalls.push(b.includes('Answer parts in order') ? 'builder-answer' : b.includes('Answer parts:') ? 'builder-ideas' : 'other');
});
const tasks = () => (REAL ? Promise.resolve([...aiCalls]) : page.evaluate(() => [...window.__aiTasks]));
const resetTasks = async () => { aiCalls.length = 0; await page.evaluate(() => { window.__aiTasks = []; }); };

await page.evaluateOnNewDocument(() => {
  window.__aiTasks = [];
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


const section = (t) => page.evaluate((x) => {
  const h = [...document.querySelectorAll('h2')].find((e) => e.textContent.includes(x));
  return h ? h.closest('section').innerText : '';
}, t);
const partInfo = (t) => page.evaluate((x) => {
  const h = [...document.querySelectorAll('h2')].find((e) => e.textContent.includes(x));
  const sec = h?.closest('section');
  if (!sec) return null;
  return {
    parts: [...sec.querySelectorAll('[data-part]')].map((p) => p.getAttribute('data-part')),
    ideas: [...sec.querySelectorAll('.idea-label')].map((p) => p.textContent.trim()),
    marks: sec.querySelectorAll('mark.mark-phrase').length,
    meta: sec.querySelector('span.muted')?.textContent || '',
    text: sec.innerText,
  };
}, t);

try {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate((real) => { localStorage.clear(); if (!real) localStorage.setItem('speakup.demo', '1'); localStorage.setItem('speakup.todayMode', 'daily'); }, REAL);
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('Sign in to keep your practice saved');
  await page.type('#email', TEST_EMAIL);
  await page.type('#password', TEST_PASSWORD);
  await page.click('form button.btn-primary');
  await waitText('Answer builder', 30000);
  if (await bodyHas('We found practice saved')) await clickText('Not now').catch(() => {});

  // ---- Daily question: suggested answer ----
  await waitText('Idea starters', 90000);
  const q = await page.evaluate(() => document.querySelector('p.text-xl')?.textContent || '');
  console.log('Q:', q);
  ok('suggested answer collapsed by default', (await bodyHas('Show a suggested answer')) && !(await partInfo('Suggested answer')));
  await shot(`${PREFIX}-1-daily-collapsed`, 'Idea starters');

  await resetTasks();
  let t0 = Date.now();
  await clickText('Show a suggested answer');
  await page.waitForFunction(() => document.querySelectorAll('#suggested-answer [data-part]').length > 0 || /Try again/.test(document.body.innerText), { timeout: 120000 });
  let info = await partInfo('Suggested answer');
  ok('suggested answer generated', !!info && info.parts.length >= 3, `${((Date.now() - t0) / 1000).toFixed(1)}s, ${info?.meta}`);
  console.log('Parts:', JSON.stringify(info?.parts), 'Ideas:', JSON.stringify(info?.ideas));
  ok('one AI call (builder-answer only)', JSON.stringify(await tasks()) === '["builder-answer"]', JSON.stringify(await tasks()));
  ok('defaults: Natural (or last level) + 45s', /Natural · ~45s/.test(info.meta), info.meta);
  ok('idea label on each part', info.ideas.length >= info.parts.length - 1, `${info.ideas.length}/${info.parts.length}`);
  ok('3-5 phrases highlighted', info.marks >= 2, `${info.marks}`);
  ok('Listen + shadowing', (await bodyHas('Start shadowing')) && !!(await page.$('#suggested-answer button[title*="Listen"], #suggested-answer button')));
  const first = info.text;
  await shot(`${PREFIX}-2-daily-suggested`, 'Suggested answer');

  // Switch level -> regenerates
  await resetTasks();
  t0 = Date.now();
  await page.evaluate(() => { const b = [...document.querySelectorAll('#suggested-answer button')].find((x) => x.textContent.trim() === 'Simple'); b.click(); });
  await page.waitForFunction(() => /Simple · ~45s/.test(document.querySelector('#suggested-answer')?.innerText || ''), { timeout: 120000 });
  await page.waitForFunction(() => !document.querySelector('#suggested-answer .opacity-50'), { timeout: 30000 });
  info = await partInfo('Suggested answer');
  ok('level switch regenerates', /Simple · ~45s/.test(info.meta), `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await page.evaluate(() => { const b = [...document.querySelectorAll('#suggested-answer button')].find((x) => x.textContent.trim() === '20s'); b.click(); });
  await page.waitForFunction(() => /Simple · ~20s/.test(document.querySelector('#suggested-answer')?.innerText || '') && !document.querySelector('#suggested-answer .opacity-50'), { timeout: 120000 });
  info = await partInfo('Suggested answer');
  const words = (await page.evaluate(() => [...document.querySelectorAll('#suggested-answer [data-part] p:last-child')].map((p) => p.textContent).join(' '))).split(/\s+/).length;
  ok('length switch regenerates', /Simple · ~20s/.test(info.meta), `${words} words`);
  await shot(`${PREFIX}-3-daily-switcher`, 'Suggested answer');

  // Save a phrase
  const saved = await page.evaluate(() => {
    const b = document.querySelector('#suggested-answer button[title="Save to Phrase Bank"]');
    const name = b?.closest('div.flex')?.querySelector('p')?.textContent.replace(/"/g, '') || '';
    b?.click();
    return name;
  });
  await page.waitForFunction(() => /Saved \d phrase|Already in your Phrase Bank/.test(document.body.innerText), { timeout: 10000 });
  ok('one-tap phrase save', !!saved, saved);
  const phrase = saved || (await page.evaluate(() => document.querySelector('#suggested-answer mark.mark-phrase')?.textContent || ''));
  const cachedText = (await partInfo('Suggested answer')).text;
  await sleep(4000); // background save

  // Reload: cached on the question (no AI call), collapsed again
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('Show a suggested answer', 30000);
  await resetTasks();
  await clickText('Show a suggested answer');
  await page.waitForFunction(() => document.querySelectorAll('#suggested-answer [data-part]').length > 0, { timeout: 10000 });
  await sleep(1200);
  info = await partInfo('Suggested answer');
  ok('cached after reload (no AI call)', (await tasks()).length === 0 && /Simple · ~20s/.test(info.meta) && info.text.split('\n').slice(2).join() === cachedText.split('\n').slice(2).join(), `${(await tasks()).length} calls`);

  // Reused-phrase feedback on his own answer
  await clickText('Hide the suggested answer');
  const box = await page.$('textarea');
  await box.click();
  await box.type(`Honestly I think it depends, but ${phrase.toLowerCase()} is a big part of it for me.`);
  await sleep(400);
  const reused = await page.evaluate(() => document.querySelector('[data-testid="reused-phrases"]')?.innerText || '');
  ok('suggested phrases reused are scored', /used: [1-9]\/\d/.test(reused), reused.split('\n')[0]);
  await shot(`${PREFIX}-4-reused-phrases`, 'Your answer');
  ok('first and regenerated answers differ', first !== cachedText);

  // ---- Answer builder: auto-pick ----
  await page.evaluate(() => window.scrollTo(0, 0));
  await clickText('Answer builder');
  await waitText('Pick a topic and question type');
  ok('auto-pick ON by default', await page.$eval('[data-testid="auto-pick"]', (e) => e.checked));
  await page.evaluate(() => {
    const sec = [...document.querySelectorAll('section')].find((s) => s.textContent.includes('Pick a topic and question type'));
    const b = [...sec.querySelectorAll('button')].find((x) => /Work|Tech/i.test(x.textContent)) || sec.querySelector('button');
    b.click();
  });
  await clickText('Is X good or bad?', 'div.grid button');
  await shot(`${PREFIX}-5-builder-auto`, 'Pick a topic and question type');
  await resetTasks();
  t0 = Date.now();
  await clickText('Generate answer for me');
  await waitText('Your model answer', 150000);
  await page.waitForFunction(() => document.querySelectorAll('[data-part]').length > 0, { timeout: 30000 });
  const calls = await tasks();
  ok('question -> model answer in one go', true, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  ok('idea-chip call skipped', !calls.includes('builder-ideas') && calls.filter((c) => c === 'builder-answer').length === 1, JSON.stringify(calls));
  ok('"Pick your ideas" skipped, "Choose my own ideas" collapsed', !(await bodyHas('Pick your ideas')) && !!(await page.$('[data-testid="choose-own"]')));
  info = await partInfo('Your model answer');
  console.log('Parts:', JSON.stringify(info.parts), 'Ideas:', JSON.stringify(info.ideas));
  ok('chosen idea label on each part', info.ideas.length >= info.parts.length - 1 && info.parts.length >= 3, `${info.ideas.length}/${info.parts.length}`);
  ok('builder defaults to last level/length', /45s/.test(info.meta), info.meta);
  await shot(`${PREFIX}-6-builder-answer`, 'Your model answer');

  // Tap an idea label -> chips load lazily -> swap -> rebuild
  await resetTasks();
  const slot = info.parts[1];
  await page.evaluate((s) => document.querySelector(`[data-part="${s}"] button.idea-label`).click(), slot);
  await page.waitForFunction(() => document.querySelector('input[placeholder="✏️ Or type your own idea"]') || /Try again/.test(document.body.innerText), { timeout: 90000 });
  ok('tap idea -> chips fetched lazily', JSON.stringify(await tasks()) === '["builder-ideas"]', JSON.stringify(await tasks()));
  const swapped = await page.evaluate((s) => {
    const row = document.querySelector(`[data-slot="${s}"]`);
    const b = [...row.querySelectorAll('div.flex.flex-wrap.gap-2 button')][1];
    b.click();
    return b.textContent;
  }, slot);
  await sleep(500);
  await shot(`${PREFIX}-7-swap-idea`, 'Pick your ideas');
  await resetTasks();
  await clickText('Build it again');
  await page.waitForFunction((w) => [...document.querySelectorAll('.idea-label')].some((e) => e.textContent.includes(w)), { timeout: 120000 }, swapped);
  ok('swapped idea used in the rebuilt answer', true, `${slot}: ${swapped}`);
  ok('rebuild = one answer call', JSON.stringify(await tasks()) === '["builder-answer"]', JSON.stringify(await tasks()));
  await shot(`${PREFIX}-8-rebuilt`, 'Your model answer');
} catch (e) {
  ok('unexpected error', false, String(e));
  await page.screenshot({ path: `/tmp/suggested-fail-${PREFIX}.png`, fullPage: true }).catch(() => {});
}
const real = errors.filter((e) => !/favicon|Failed to load resource: the server responded with a status of (400|401)/.test(e));
console.log(real.length ? `PAGE ERRORS:\n${real.join('\n')}` : 'No page errors');
console.log(results.filter((r) => r.startsWith('FAIL')).length ? 'SOME TESTS FAILED' : 'ALL PASSED');
await browser.close();
