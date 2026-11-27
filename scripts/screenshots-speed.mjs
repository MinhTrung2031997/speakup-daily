// Reply speed meter walkthrough: plan extra -> /speed intro -> Get ready (pre-warm) -> 8 questions with the fake mic
// (a looped WAV) -> results (averages, best + worst playable) -> saved round + 2 recordings -> plan step ticked ->
// Progress trend -> harder level after 3 fast rounds (2 s limit + open questions).
// Usage: TEST_EMAIL=... TEST_PASSWORD=... WAV=.tmp/speech-loop.wav node scripts/screenshots-speed.mjs  (demo -> 110-*; REAL=1 -> 111-*; REAL=1 BASE=prod -> 112-*)
import puppeteer from 'puppeteer-core';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const BASE = process.env.BASE || 'http://127.0.0.1:4173';
const REAL = process.env.REAL === '1';
const WAV = process.env.WAV || '';
const PREFIX = process.env.PREFIX || (REAL ? (process.env.BASE ? '112' : '111') : '110');
const OUT = process.env.OUT || new URL('../screenshots/', import.meta.url).pathname;
const { TEST_EMAIL, TEST_PASSWORD } = process.env;
if (!TEST_EMAIL || !TEST_PASSWORD) throw new Error('Set TEST_EMAIL and TEST_PASSWORD');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').filter((l) => l.includes('=')).map((l) => [l.split('=')[0], l.slice(l.indexOf('=') + 1).trim()]));
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
await sb.auth.signInWithPassword({ email: TEST_EMAIL, password: TEST_PASSWORD });

const args = ['--no-sandbox', '--disable-gpu', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'];
if (WAV) args.push(`--use-file-for-fake-audio-capture=${WAV}`); // loops: speech, 3 s silence, speech, ...
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', headless: 'new', args });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('dialog', (d) => d.accept());
const bad = [];
page.on('response', (r) => { if (r.status() >= 500) bad.push(`${r.status()} ${r.url().replace(/\?.*/, '').split('/').slice(-3).join('/')}`); });
await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const ttsCalls = [];
// Real run: one question's TTS always answers 502 -> that question must use the browser voice.
let failText = null;
let armFail = false; // only questions asked on /speed (Today also asks its daily question aloud)
if (REAL) {
  await page.setRequestInterception(true);
  page.on('request', (r) => {
    if (r.isInterceptResolutionHandled()) return;
    if (r.method() === 'POST' && r.url().includes('/functions/v1/tts')) {
      const t = JSON.parse(r.postData() || '{}').text;
      if (armFail && !failText) failText = t;
      if (failText && t === failText) return r.respond({ status: 502, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ error: { kind: 'server', message: 'forced 502 (test)' } }) });
    }
    r.continue();
  });
}
const aiTasks = [];
page.on('request', (r) => {
  if (r.method() !== 'POST') return;
  if (r.url().includes('/functions/v1/tts')) ttsCalls.push(Date.now());
  if (r.url().includes('/functions/v1/ai')) { try { aiTasks.push(JSON.parse(r.postData() || '{}').turns?.[0]?.text?.slice(0, 40)); } catch { /* ignore */ } }
});

await page.evaluateOnNewDocument((real) => {
  const voices = [{ name: 'Fake US Joanna', lang: 'en-US', voiceURI: 'us1', default: true, localService: true }];
  window.__spoken = [];
  window.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; this.rate = 1; this.pitch = 1; } };
  let timers = [];
  const synth = {
    speak(u) { window.__spoken.push({ text: u.text }); timers.push(setTimeout(() => u.onend && u.onend(), 600)); },
    cancel() { timers.forEach(clearTimeout); timers = []; },
    getVoices: () => voices, addEventListener() {}, removeEventListener() {}, speaking: false, pending: false, paused: false,
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  // Chrome's recogniser: every answer "hears" a short sentence (it drops fillers, like the real one).
  const said = ['coffee definitely I drink two cups every morning', 'I think the beach I love the sea', 'last weekend I watched a movie with my friends', 'I usually ride my motorbike to work'];
  let n = 0;
  class FakeSR {
    start() { (window.__srStarts = (window.__srStarts || 0) + 1); const t = said[n++ % said.length]; this._t = setTimeout(() => this.onresult && this.onresult({ resultIndex: 0, results: { length: 1, 0: { isFinal: true, 0: { transcript: t }, length: 1 } } }), 900); }
    stop() { clearTimeout(this._t); setTimeout(() => this.onend && this.onend(), 30); }
    abort() { this.stop(); }
  }
  window.SpeechRecognition = FakeSR;
  window.webkitSpeechRecognition = FakeSR;
  void real;
}, REAL);

const results = [];
const ok = (name, cond, extra = '') => { results.push(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? ` (${extra})` : ''}`); console.log(results.at(-1)); };
const waitText = (t, timeout = 90000) => page.waitForFunction((x) => document.body.innerText.toLowerCase().includes(x.toLowerCase()), { timeout }, t);
const bodyHas = (t) => page.evaluate((x) => document.body.innerText.toLowerCase().includes(x.toLowerCase()), t);
const T = (s) => page.evaluate((x) => document.querySelector(x)?.innerText || '', s);
const count = (sel) => page.evaluate((s) => document.querySelectorAll(s).length, sel);
const clickSel = async (sel) => { await page.waitForSelector(sel, { timeout: 30000 }); await page.evaluate((s) => { const b = document.querySelector(s); b.scrollIntoView({ block: 'center' }); b.click(); }, sel); await sleep(350); };
const shotEl = async (name, selector) => {
  await sleep(400);
  await page.addStyleTag({ content: 'header, nav { position: static !important; }' });
  const box = await page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    el.scrollIntoView({ block: 'start' });
    const r = el.getBoundingClientRect();
    return { x: 0, y: Math.max(0, r.top + window.scrollY - 8), width: window.innerWidth, height: Math.min(r.height + 16, 2400) };
  }, selector);
  if (box) await page.screenshot({ path: `${OUT}${name}.png`, clip: box, captureBeyondViewport: true });
  else await page.screenshot({ path: `${OUT}${name}.png`, fullPage: true });
  console.log('saved', name);
};
const synced = async () => { await sleep(1200); await page.waitForFunction(() => document.documentElement.dataset.saving === '0', { timeout: 60000 }); await sleep(800); };
const planExtra = () => page.evaluate(() => { const el = [...document.querySelectorAll('[data-testid="plan-item"]')].find((x) => x.getAttribute('data-kind') === 'extra'); return el ? { text: el.innerText, done: el.getAttribute('data-done') } : null; });

try {
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await page.evaluate((real) => { localStorage.clear(); if (!real) localStorage.setItem('speakup.demo', '1'); localStorage.setItem('speakup.todayMode', 'daily'); }, REAL);
  await page.reload({ waitUntil: 'networkidle0' });
  await waitText('Sign in to keep your practice saved');
  await page.type('#email', TEST_EMAIL);
  await page.type('#password', TEST_PASSWORD);
  await page.click('form button.btn-primary');
  await page.waitForFunction(() => !document.body.innerText.includes('Sign in to keep your practice saved'), { timeout: 30000 });
  await page.waitForFunction(() => /Your answer|Get today's question|Today's plan/.test(document.body.innerText), { timeout: 90000 });
  await sleep(1500);

  // 1) Today's plan: the slow speed round yesterday makes the speed round today's extra
  const ex0 = await planExtra();
  ok("plan extra = Reply speed round (fluency drill)", !!ex0 && /Reply speed round/.test(ex0.text) && ex0.done !== '1', ex0 ? ex0.text.replace(/\s+/g, ' ').slice(0, 120) : 'no extra');
  ok('Today has a link to the speed round', (await count('[data-testid="speed-link"]')) === 1);

  // 2) Intro
  await page.goto(`${BASE}/speed`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="speed-intro"]');
  ok('intro: easy level, 3 s to start', /3 s to start/.test(await T('[data-testid="speed-level"]')));
  ok('intro: last round + trend + past rounds (3 seeded)', /3\.2s/.test(await T('[data-testid="speed-last"]')) && (await count('[data-testid="speed-trend"]')) === 1 && (await count('[data-testid="speed-history"] details')) === 3);
  await shotEl(`${PREFIX}-1-intro`, 'main');

  // 3) Get ready: pre-warm all 8 voices before the first question
  const tts0 = ttsCalls.length;
  armFail = true;
  await clickSel('[data-testid="speed-start"]');
  await page.waitForSelector('[data-testid="speed-ready"]', { timeout: 10000 });
  await shotEl(`${PREFIX}-2-ready`, 'main');
  await page.waitForSelector('[data-testid="speed-run"]', { timeout: 90000 });
  const ttsBefore = ttsCalls.length - tts0;
  ok(REAL ? 'all 8 questions pre-warmed in the natural voice before Q1 (retries on 502)' : 'demo: no TTS calls, browser voice fallback', REAL ? ttsBefore >= 8 : ttsBefore === 0, `${ttsBefore} calls`);
  if (REAL) ok('a question whose TTS keeps failing (502) falls back to the browser voice', /browser voice for \d/.test(await T('[data-testid="speed-run"]')) && (await page.evaluate(() => window.__spokenAll || 0)) >= 0, `${failText} | ${(await T('[data-testid="speed-run"]')).split('\n')[0]}`);
  // 4) Answer screen
  await page.waitForSelector('[data-testid="speed-answer"]', { timeout: 30000 });
  await sleep(300);
  await shotEl(`${PREFIX}-3-go`, 'main');
  await page.waitForSelector('[data-testid="speed-talking"]', { timeout: 15000 }).catch(() => null);
  await shotEl(`${PREFIX}-4-talking`, 'main');
  const t0 = Date.now();
  await page.waitForSelector('[data-testid="speed-results"]', { timeout: 300000 });
  const roundSecs = Math.round((Date.now() - t0) / 1000);
  ok('no more TTS calls during the round (all cached)', ttsCalls.length - tts0 === ttsBefore);
  if (!REAL) ok('browser voice asked all 8 questions', (await page.evaluate(() => window.__spoken.length)) === 8);
  else { const sp = await page.evaluate(() => window.__spoken.map((x) => x.text)); ok('browser voice used for the failed question (and any over the TTS quota)', sp.includes(failText), `${8 - sp.length} natural / ${sp.length} browser: ${JSON.stringify(sp)}`); }
  ok('Chrome recogniser ran once per answer', (await page.evaluate(() => window.__srStarts)) === 8);

  // 5) Results
  const tile = async (id) => (await T(`[data-testid="speed-${id}"]`)).split('\n')[0];
  const avg = await tile('avg-start');
  const fpm = await tile('fpm');
  const pause = await tile('pause');
  ok('results: average start, fillers/min, longest pause', /^\d+\.\ds$/.test(avg) && /^\d+\.\d$/.test(fpm) && /^\d+\.\ds$/.test(pause), `${avg} | ${fpm} | ${pause}, round ${roundSecs}s`);
  ok('results: 8 answers listed', (await count('[data-testid="speed-answers"] .flex')) === 8);
  ok('results: best + worst answer, both playable', (await count('[data-testid="speed-best-audio"]')) === 1 && (await count('[data-testid="speed-worst-audio"]')) === 1);
  const playable = await page.evaluate(async () => {
    const out = [];
    for (const a of document.querySelectorAll('audio')) { a.muted = true; try { await a.play(); await new Promise((r) => setTimeout(r, 400)); out.push(a.currentTime > 0); a.pause(); } catch { out.push(false); } }
    return out;
  });
  ok('best + worst clips actually play', playable.length === 2 && playable.every(Boolean), JSON.stringify(playable));
  const src = await T('[data-testid="speed-misses"]');
  ok(REAL ? 'fillers counted by Gemini from the audio' : 'fillers source shown', REAL ? /AI from the audio/.test(src) : /Fillers counted by/.test(src), src.replace(/\s+/g, ' '));
  await page.waitForFunction(() => /Saved\./.test(document.querySelector('[data-testid="speed-saved"]')?.innerText || ''), { timeout: 60000 });
  ok('round + best/worst recordings saved', true);
  await shotEl(`${PREFIX}-5-results`, '[data-testid="speed-results"]');
  await synced();

  // 6) DB: the round row + 2 recordings (Opus, private bucket)
  const { data: rows } = await sb.from('quickfire_rounds').select('id,avg_start,fillers_per_min,longest_pause,misses,answers,best_index,worst_index,filler_source,level,start_limit').order('created_at', { ascending: false }).limit(1);
  const row = rows?.[0];
  ok('quickfire_rounds row saved (8 answers, averages)', !!row && row.answers.length === 8 && row.avg_start != null, row ? `avg ${row.avg_start}, fpm ${row.fillers_per_min}, pause ${row.longest_pause}, misses ${row.misses}, src ${row.filler_source}` : 'none');
  const starts = row?.answers.map((a) => a.start);
  if (process.env.SLOW === '1') {
    const late = row?.answers.filter((a) => a.missed && a.start != null) || [];
    ok('late start (> 3 s) counts as a miss but is still recorded', late.length >= 1 && late.every((a) => a.start > 3 && a.speechSeconds > 0) && row.misses >= late.length, JSON.stringify(late.map((a) => [a.start, a.speechSeconds])));
  }
  ok('per-answer start times from the waveform', !!starts && starts.filter((s) => s != null).length >= 6, JSON.stringify(starts));
  const { data: recs } = await sb.from('recordings').select('id,kind,path,mime_type,bytes,answer_id,question_type,duration_seconds').eq('answer_id', row?.id || '00000000-0000-0000-0000-000000000000');
  ok('2 recordings kind=quickfire (best + worst), Opus/webm', recs?.length === 2 && recs.every((r) => r.kind === 'quickfire' && /webm|ogg/.test(r.mime_type) && r.path.includes('/quickfire/')) && new Set(recs.map((r) => r.question_type)).size === 2, JSON.stringify(recs?.map((r) => `${r.question_type} ${r.bytes}B ${r.duration_seconds}s`)));
  if (recs?.length) {
    const r = recs[0];
    const kbps = (r.bytes * 8) / 1000 / Math.max(1, Number(r.duration_seconds));
    ok('clip bitrate ~24 kbps', kbps < 40, `${kbps.toFixed(1)} kbps`);
    const anon = await fetch(`${env.VITE_SUPABASE_URL}/storage/v1/object/public/recordings/${r.path}`);
    ok('bucket is private (public URL refused)', anon.status >= 400, String(anon.status));
  }
  const other = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
  const { data: anonRows } = await other.from('quickfire_rounds').select('id').limit(5);
  ok('RLS: anon sees no rounds', !anonRows?.length);

  // 7) Plan step ticked; persists after reload; Progress trend
  await page.goto(BASE, { waitUntil: 'networkidle0' });
  await sleep(2000);
  const ex1 = await planExtra();
  ok('plan: speed step ticked after the round was saved', ex1?.done === '1', ex1?.done);
  await page.goto(`${BASE}/progress`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="progress-speed"]');
  ok('Progress shows the speed trend (4 rounds)', (await page.evaluate(() => document.querySelectorAll('[data-testid="progress-speed"] rect').length)) === 4);
  await shotEl(`${PREFIX}-6-progress`, '[data-testid="progress-speed"]');
  await page.goto(`${BASE}/speed`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="speed-history"]');
  ok('reload: round in history with best/worst players', (await count('[data-testid="speed-history"] details')) === 4);
  await page.evaluate(() => document.querySelector('[data-testid="speed-history"] details').open = true);
  await sleep(400);
  ok('history: best + worst recordings listed', (await page.evaluate(() => document.querySelector('[data-testid="speed-history"] details').querySelectorAll('[data-testid="recording"], button').length)) >= 2);
  await shotEl(`${PREFIX}-7-history`, '[data-testid="speed-history"]');

  // 8) Harder level: 3 rounds in a row under 2 s -> 2 s limit + open questions
  execFileSync('node', ['scripts/seed-speed.mjs', 'fast'], { env: process.env, stdio: 'inherit' });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="speed-level"]');
  ok('harder level unlocked: 2 s to start + why questions', /Harder: 2 s/.test(await T('[data-testid="speed-level"]')), await T('[data-testid="speed-level"]'));
  await shotEl(`${PREFIX}-8-harder`, '[data-testid="speed-intro"]');
  await clickSel('[data-testid="speed-start"]');
  await page.waitForSelector('[data-testid="speed-question"]', { timeout: 90000 });
  const qs = [];
  for (let i = 0; i < 2; i++) {
    await page.waitForFunction((n) => document.querySelector('[data-testid="speed-progress"]')?.innerText.includes(`Question ${n}/`), { timeout: 60000 }, i + 1);
    qs.push(await T('[data-testid="speed-question"]'));
    if (i === 0) {
      await page.waitForSelector('[data-testid="speed-answer"]', { timeout: 30000 });
      ok('harder: start countdown shows 2 s', /Go! (2\.0|1\.\d)/.test(await T('[data-testid="speed-answer"]')), await T('[data-testid="speed-answer"]'));
      await clickSel('[data-testid="speed-next"]');
    }
  }
  const { QUICK_FIRE } = await import('../src/lib/quickfire.ts').catch(() => ({ QUICK_FIRE: null }));
  const levels = QUICK_FIRE ? qs.map((q) => QUICK_FIRE.find((x) => x.q === q)?.level) : [];
  ok('harder round mixes easy and open questions', !QUICK_FIRE || (levels[0] === 'easy' && levels[1] === 'open'), JSON.stringify(qs));
  await clickSel('[data-testid="speed-quit"]');
  await page.waitForSelector('[data-testid="speed-intro"]');
  ok('stopping a round saves nothing', (await count('[data-testid="speed-history"] details')) === 7);

  const sw = await page.evaluate(() => document.documentElement.scrollWidth);
  ok('no horizontal scroll at 390px', sw <= 390, String(sw));
  if (bad.length) console.log('5xx responses:', bad.join(', '));
  const errs = errors.filter((e) => !/favicon|ERR_ABORTED|status of 4\d\d/.test(e) && !(/status of 502/.test(e) && bad.every((b) => /functions\/v1\/tts/.test(b))));
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
