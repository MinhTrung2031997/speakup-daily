// Daily history + longer ("Extended") and multiple ("➕ Another angle") suggested answers.
// Mobile screenshots (390px wide) against the real Supabase project. Needs a confirmed throwaway user.
// Needs a confirmed throwaway user. Usage:
//   npm run build && npx vite preview --host 127.0.0.1 --port 4173 &
//   TEST_EMAIL=... TEST_PASSWORD=... node scripts/screenshots-daily-history.mjs          # demo (mock) AI
//   REAL=1 TEST_EMAIL=... TEST_PASSWORD=... node scripts/screenshots-daily-history.mjs   # real AI via the `ai` Edge Function
import puppeteer from 'puppeteer-core';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const REAL = process.env.REAL === '1';
const PREFIX = process.env.PREFIX || (REAL ? '71' : '70');
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
const prompts = [];
page.on('request', (r) => {
  if (!r.url().includes('/functions/v1/ai') || r.method() !== 'POST') return;
  const b = r.postData() || '';
  aiCalls.push(b.includes('Answer parts in order') ? 'builder-answer' : b.includes('Answer parts:') ? 'builder-ideas' : 'other');
  if (b.includes('Answer parts in order')) prompts.push(b);
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



const vinfo = () => page.evaluate(() => {
  const root = document.querySelector('#suggested-answer');
  const open = root?.querySelector('[data-open]');
  return {
    count: root ? root.querySelectorAll('[data-version]').length : 0,
    openV: open?.getAttribute('data-version') || '',
    label: open?.querySelector('[data-testid="version-label"]')?.textContent || '',
    parts: open ? [...open.querySelectorAll('[data-part]')].map((p) => p.getAttribute('data-part')) : [],
    words: open ? [...open.querySelectorAll('[data-part] p:last-child')].map((p) => p.textContent).join(' ').split(/\s+/).filter(Boolean).length : 0,
    phrases: open ? [...open.querySelectorAll('mark.mark-phrase')].map((m) => m.textContent.toLowerCase()) : [],
    meta: open?.querySelector('span.muted')?.textContent || '',
  };
});
const idle = () => page.waitForFunction(() => !document.querySelector('#suggested-answer .opacity-50') && !/Writing (V\d|a model answer)/.test(document.querySelector('#suggested-answer')?.innerText || ''), { timeout: 150000 });
const clickIn = (sel, text) => page.evaluate((s, t) => { const b = [...document.querySelectorAll(s)].find((x) => x.textContent.trim() === t || x.textContent.includes(t)); if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true; }, sel, text);

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
  await waitText('Idea starters', 90000);
  const q1 = await page.evaluate(() => document.querySelector('p.text-xl')?.textContent || '');
  console.log('Q1:', q1);

  // ---- V1, then Extended ----
  await clickText('Show a suggested answer');
  await page.waitForFunction(() => document.querySelectorAll('#suggested-answer [data-part]').length > 0, { timeout: 150000 });
  await idle();
  let v = await vinfo();
  ok('V1 generated', v.count === 1, v.meta);
  await resetTasks(); prompts.length = 0;
  let t0 = Date.now();
  await clickIn('#suggested-answer button', 'Extended');
  await page.waitForFunction(() => /Extended \(2 min\)/.test(document.querySelector('#suggested-answer [data-open] span.muted')?.textContent || ''), { timeout: 150000 });
  await idle();
  v = await vinfo();
  const extSecs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log('Extended parts:', JSON.stringify(v.parts), v.words, 'words');
  ok('Extended (120s) rewrites V1 in place', v.count === 1 && /Extended/.test(v.meta), `${extSecs}s`);
  ok('Extended has more parts (personal touch + counterpoint)', v.parts.includes('Personal touch') && v.parts.includes('On the other hand') && v.parts.length >= 7, `${v.parts.length} parts`);
  if (REAL) {
    ok('Extended is ~250-300 words', v.words >= 200 && v.words <= 360, `${v.words} words`);
    ok('prompt asks for 2 reasons/examples + counterpoint', prompts.some((p) => p.includes('Give 2 reasons and 2 short examples') && p.includes('On the other hand')));
  }
  await shot(`${PREFIX}-1-extended`, 'Suggested answer');
  const v1Phrases = v.phrases;

  // ---- ➕ Another angle ----
  await resetTasks(); prompts.length = 0;
  t0 = Date.now();
  await clickText('Another angle');
  await page.waitForFunction(() => document.querySelectorAll('#suggested-answer [data-version]').length === 2, { timeout: 150000 });
  await idle();
  v = await vinfo();
  ok('V2 added below, V1 kept', v.count === 2 && v.openV === '2', `${((Date.now() - t0) / 1000).toFixed(1)}s, ${v.label}`);
  ok('V2 stance rotated (disagree)', /disagree/.test(v.label), v.label);
  // One builder-answer call (real AI: + one "too short" follow-up when needed; 503 retries also show up here).
  { const t = await tasks(); const fix = prompts.filter((p) => p.includes('Too short:')).length;
    ok('V2 = builder-answer only (no other AI calls)', t.length >= 1 && t.every((x) => x === 'builder-answer') && (REAL || t.length === 1), `${t.length} request(s), ${fix} length follow-up(s)`); }
  if (REAL) ok('V2 prompt has the earlier version + NEW-version line', prompts.some((p) => p.includes('Write a NEW version with a different angle or stance and different phrases from these')));
  const overlap = v.phrases.filter((p) => v1Phrases.includes(p));
  ok('V2 phrases differ from V1', overlap.length <= 1, `${v.phrases.length} phrases, ${overlap.length} shared`);
  await shot(`${PREFIX}-2-another-angle`, 'Suggested answer V2');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.evaluate(() => document.querySelector('#suggested-answer').scrollIntoView({ block: 'start' }));
  await sleep(400);
  await page.screenshot({ path: `${OUT}${PREFIX}-3-versions.png`, fullPage: false }); console.log('saved', `${PREFIX}-3-versions`);

  // Up to 5 versions, then delete one
  for (let n = 3; n <= 5; n++) {
    await clickText('Another angle');
    await page.waitForFunction((k) => document.querySelectorAll('#suggested-answer [data-version]').length === k, { timeout: 150000 }, n);
    await idle();
  }
  v = await vinfo();
  const stances = await page.evaluate(() => [...document.querySelectorAll('#suggested-answer [data-version]')].map((e) => (e.querySelector('[data-testid="version-label"]') || e.querySelector('span.block'))?.textContent || ''));
  console.log('Versions:', JSON.stringify(stances));
  const addBtnDisabled = await page.evaluate(() => [...document.querySelectorAll('#suggested-answer button')].find((b) => b.textContent.includes('Another angle'))?.disabled);
  ok('capped at 5 versions', v.count === 5 && addBtnDisabled && (await bodyHas('Max 5 versions')));
  // delete V3
  await page.evaluate(() => [...document.querySelectorAll('#suggested-answer [data-version="3"]')][0].click());
  await sleep(300);
  await page.evaluate(() => document.querySelector('#suggested-answer [data-open] button[title="Delete this version"]').click());
  await page.waitForFunction(() => document.querySelectorAll('#suggested-answer [data-version]').length === 4, { timeout: 10000 });
  ok('delete a version', true, '5 -> 4');
  await sleep(4000); // background save

  // ---- His answer: phrase reuse across all versions, then upgrade (links the answer to the question) ----
  const allPhrases = await page.evaluate(() => [...document.querySelectorAll('#suggested-answer mark.mark-phrase')].map((m) => m.textContent));
  await page.evaluate(() => [...document.querySelectorAll('#suggested-answer [data-version="1"]')][0].click());
  await sleep(300);
  const p1 = await page.evaluate(() => document.querySelector('#suggested-answer [data-open] mark.mark-phrase')?.textContent || '');
  await page.evaluate(() => [...document.querySelectorAll('#suggested-answer [data-version="2"]')][0].click());
  await sleep(300);
  const p2 = await page.evaluate(() => document.querySelector('#suggested-answer [data-open] mark.mark-phrase')?.textContent || '');
  await clickText('Hide the suggested answer');
  const box = await page.$('textarea');
  await box.click({ clickCount: 3 });
  await page.keyboard.press('Backspace');
  await box.type(`Honestly ${p1.toLowerCase()} for me, but ${p2.toLowerCase()} too, so I use it every single day at work.`);
  await sleep(400);
  const reused = await page.evaluate(() => document.querySelector('[data-testid="reused-phrases"]')?.innerText.split('\n')[0] || '');
  ok('reused phrases counted across versions', /used: 2\/\d+/.test(reused) && Number(reused.match(/\/(\d+)/)?.[1]) > 5, `${reused} (V1 "${p1}", V2 "${p2}")`);
  t0 = Date.now();
  await clickText('Upgrade my answer').catch(() => clickText('Upgrade again'));
  await page.waitForFunction(() => /Shadowing|Say it again/.test(document.body.innerText), { timeout: 150000 });
  ok('answer upgraded', true, `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  await sleep(5000);

  // Persisted after reload
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('Show a suggested answer', 30000);
  await resetTasks();
  await clickText('Show a suggested answer');
  await page.waitForFunction(() => document.querySelectorAll('#suggested-answer [data-version]').length > 0, { timeout: 10000 });
  await sleep(800);
  v = await vinfo();
  ok('4 versions saved (reload, no AI call)', v.count === 4 && (await tasks()).length === 0, `${v.count} versions`);

  // ---- A second question with only a suggestion ----
  await clickText('Hide the suggested answer');
  await page.evaluate(() => window.scrollTo(0, 0));
  // (demo questions cycle, so a new one can repeat a recent one: try up to 3 times)
  for (let i = 0; i < 3; i++) {
    await clickText('New question');
    await sleep(800);
    await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('New question') && !b.disabled) && /Show a suggested answer/.test(document.body.innerText), { timeout: 120000 });
    if (await page.evaluate((old) => document.querySelector('p.text-xl')?.textContent !== old, q1)) break;
  }
  await waitText('Show a suggested answer');
  const q2 = await page.evaluate(() => document.querySelector('p.text-xl')?.textContent || '');
  console.log('Q2:', q2);
  await clickText('Show a suggested answer');
  await page.waitForFunction(() => document.querySelectorAll('#suggested-answer [data-part]').length > 0, { timeout: 150000 });
  await idle();
  await sleep(4000);

  // ---- History: Daily ----
  await page.evaluate(() => window.scrollTo(0, 0));
  await clickText('Past questions', 'a');
  await page.waitForFunction(() => location.search.includes('tab=daily') && document.querySelectorAll('[data-daily]').length > 0, { timeout: 20000 });
  const rows = await page.evaluate(() => [...document.querySelectorAll('[data-daily]')].map((r) => r.innerText.split('\n').join(' | ')));
  console.log('Daily rows:', JSON.stringify(rows.map((r) => r.slice(0, 140)), null, 1));
  ok('Past questions link opens History > Daily', true);
  ok('newest first: Q2 then Q1', rows.length >= 2 && rows[0].includes(q2.slice(0, 25)) && rows.some((r) => r.includes(q1.slice(0, 25))));
  ok('Q1 shows answered + 4 suggested', rows.some((r) => r.includes(q1.slice(0, 25)) && /Answered|answers/.test(r) && /4 suggested/.test(r)));
  ok('Q2 shows 1 suggested, not answered', /1 suggested/.test(rows[0]) && !/Answered/.test(rows[0]));
  await shot(`${PREFIX}-4-history-daily`);
  await clickIn('[role="tab"]', 'Answered');
  await sleep(300);
  let n = await page.evaluate(() => [...document.querySelectorAll('[data-daily]')].map((r) => r.innerText));
  ok('filter: Answered', n.length >= 1 && n.every((t) => /Answered|answers/.test(t)) && n.length === rows.filter((t) => /Answered|answers/.test(t)).length, `${n.length} rows`);
  await clickIn('[role="tab"]', 'Suggested only');
  await sleep(300);
  n = await page.evaluate(() => [...document.querySelectorAll('[data-daily]')].map((r) => r.innerText));
  ok('filter: Suggested only', n.length >= 1 && n.some((t) => t.includes(q2.slice(0, 25))) && !n.some((t) => t.includes(q1.slice(0, 25))), `${n.length} rows`);
  await shot(`${PREFIX}-5-history-suggested-only`);
  await clickIn('[role="tab"]', 'All');
  await sleep(300);
  // Detail
  await page.evaluate((qq) => [...document.querySelectorAll('[data-daily] > button')].find((b) => b.textContent.includes(qq)).click(), q1.slice(0, 25));
  await page.waitForFunction(() => document.querySelectorAll('#suggested-answer [data-version]').length === 4, { timeout: 10000 });
  const detail = await page.evaluate(() => document.querySelector('[data-daily] [aria-expanded="true"]')?.closest('[data-daily]')?.innerText || '');
  ok('detail: his answer + 4 versions + Listen/shadow', /Your answer/.test(detail) && /4 versions/.test(detail) && /Listen/.test(detail) && /shadowing/i.test(detail));
  ok('detail: suggested phrases he used', /Suggested phrases you used: .+\(2\/\d+\)/.test(detail));
  await page.evaluate(() => document.querySelector('[data-daily] [aria-expanded="true"]').scrollIntoView({ block: 'start' }));
  await sleep(300);
  await page.screenshot({ path: `${OUT}${PREFIX}-6-history-detail.png`, fullPage: true }); console.log('saved', `${PREFIX}-6-history-detail`);

  // ---- Answer builder: Extended ----
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle0' });
  await clickText('Answer builder');
  await waitText('Pick a topic and question type');
  await page.evaluate(() => {
    const sec = [...document.querySelectorAll('section')].find((s) => s.textContent.includes('Pick a topic and question type'));
    const b = [...sec.querySelectorAll('button')].find((x) => /Work|Tech/i.test(x.textContent)) || sec.querySelector('button');
    b.click();
  });
  await clickText('Is X good or bad?', 'div.grid button');
  await clickText('Just the question');
  await waitText('Level and length', 120000);
  await clickText('Extended');
  await resetTasks();
  t0 = Date.now();
  await clickText('Generate answer for me');
  await page.waitForFunction(() => /Extended \(2 min\)/.test(document.body.innerText) && document.querySelectorAll('[data-part]').length > 0, { timeout: 150000 });
  const b = await page.evaluate(() => {
    const parts = [...document.querySelectorAll('[data-part]')];
    return { parts: parts.map((p) => p.getAttribute('data-part')), words: parts.map((p) => p.querySelector('p:last-child').textContent).join(' ').split(/\s+/).length };
  });
  console.log('Builder Extended:', JSON.stringify(b));
  ok('builder Extended answer', b.parts.includes('On the other hand') && b.parts.length >= 7 && (!REAL || b.words >= 200), `${((Date.now() - t0) / 1000).toFixed(1)}s, ${b.parts.length} parts, ${b.words} words`);
  await shot(`${PREFIX}-7-builder-extended`, 'Your model answer');
} catch (e) {
  ok('unexpected error', false, String(e));
  await page.screenshot({ path: `/tmp/daily-fail-${PREFIX}.png`, fullPage: true }).catch(() => {});
}
const real = errors.filter((e) => !/favicon|Failed to load resource: the server responded with a status of (400|401)/.test(e));
console.log(real.length ? `PAGE ERRORS:\n${real.join('\n')}` : 'No page errors');
console.log(results.filter((r) => r.startsWith('FAIL')).length ? 'SOME TESTS FAILED' : 'ALL PASSED');
await browser.close();
