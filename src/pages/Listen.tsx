import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { useAIConfig } from '../lib/hooks';
import { listenDrill, scoreRetell } from '../lib/ai';
import { errorText } from '../lib/gemini';
import { todayStr, uid } from '../lib/date';
import { markPhrases, matchScore, wordDiff } from '../lib/diff';
import { analyzeFluency, withAudioFluency } from '../lib/fluency';
import type { AudioClip } from '../lib/audio';
import PronunciationCard from '../components/PronunciationCard';
import { dialogueVoices, speakWith, stopSpeaking, ttsSupported, useEnglishVoices, type SpeechSample } from '../lib/speech';
import type { Accent, BuilderLevel, ListenSession, PronunciationResult } from '../lib/types';
import FluencyCard from '../components/FluencyCard';
import ListenPlayer from '../components/ListenPlayer';
import MicInput from '../components/MicInput';
import PhraseCards from '../components/PhraseCards';
import { ShadowCard } from '../components/ShadowPractice';
import { ErrorBox, PageTitle, Spinner } from '../components/ui';
import Icon from '../components/Icon';

const PREFS_KEY = 'speakup.listen';
const SPEEDS = [0.75, 1, 1.25];
const SLOW_SPEEDS = [0.6, 0.7, 0.8];
const LEVELS: BuilderLevel[] = ['Simple', 'Natural', 'Fluent'];
const MAX_DICTATION_PLAYS = 3;
const RETELL_SECONDS = 60;

interface Prefs { topic: string; accent: Accent; speed: number; level: BuilderLevel; slow: number }
const DEFAULT_PREFS: Prefs = { topic: '', accent: 'US', speed: 1, level: 'Natural', slow: 0.8 };
function loadPrefs(): Prefs {
  try { return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) || '{}') as Partial<Prefs>) }; } catch { return DEFAULT_PREFS; }
}

const pill = (on: boolean) =>
  `rounded-full border px-3 py-1.5 text-sm transition ${on
    ? 'border-blue-600 bg-blue-600 text-white dark:border-blue-400 dark:bg-blue-500 dark:text-slate-950'
    : 'border-slate-300 bg-white text-slate-700 hover:border-blue-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200'}`;

function Step({ n, title, children, right }: { n: number | string; title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="h-section flex items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white dark:bg-blue-500 dark:text-slate-950">{n}</span>
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function ScoreRing({ score, size = 'h-16 w-16' }: { score: number; size?: string }) {
  const color = score >= 80 ? 'text-emerald-600 dark:text-emerald-300' : score >= 60 ? 'text-blue-600 dark:text-blue-300' : 'text-amber-600 dark:text-amber-300';
  return (
    <div className={`relative shrink-0 ${size}`}>
      <svg viewBox="0 0 36 36" className={`${size} -rotate-90`}>
        <circle cx="18" cy="18" r="15.9" fill="none" className="stroke-slate-200 dark:stroke-slate-800" strokeWidth="3.5" />
        <circle cx="18" cy="18" r="15.9" fill="none" stroke="currentColor" className={color} strokeWidth="3.5" strokeDasharray={`${score} 100`} strokeLinecap="round" />
      </svg>
      <span className={`absolute inset-0 flex items-center justify-center text-lg font-bold ${color}`}>{score}</span>
    </div>
  );
}

/** Plays dialogue lines with two voices. Returns controls and the line being spoken. */
function useDialoguePlayer(accent: Accent) {
  useEnglishVoices(); // re-render when voices load
  const [current, setCurrent] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const run = useRef(0);
  useEffect(() => () => { run.current++; stopSpeaking(); }, []);
  const stop = () => { run.current++; stopSpeaking(); setPlaying(false); setCurrent(-1); };
  const play = async (lines: { speaker: string; text: string }[], rate: number, from = 0, only = false) => {
    if (!ttsSupported()) return;
    stopSpeaking();
    const id = ++run.current;
    const voices = dialogueVoices(accent);
    setPlaying(true);
    for (let i = from; i < (only ? from + 1 : lines.length); i++) {
      if (run.current !== id) return;
      setCurrent(i);
      const v = voices[lines[i].speaker === 'Sam' ? 1 : 0];
      await speakWith(lines[i].text, { voice: v.voice, pitch: v.pitch, rate, lang: accent === 'UK' ? 'en-GB' : 'en-US' });
      if (!only && run.current === id) await new Promise((r) => setTimeout(r, 250));
    }
    if (run.current === id) { setPlaying(false); setCurrent(-1); }
  };
  return { current, playing, play, stop, voices: dialogueVoices(accent) };
}

export default function Listen() {
  const { state, update, logActivity } = useStore();
  const ai = useAIConfig();
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const setPrefs = (p: Partial<Prefs>) => setPrefsState((cur) => {
    const next = { ...cur, ...p };
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  });
  const [custom, setCustom] = useState('');
  const topics = useMemo(() => { const a = state.topics.filter((t) => t.active); return a.length ? a : state.topics; }, [state.topics]);
  const topicLabel = custom.trim() || prefs.topic;

  const [sessionId, setSessionId] = useState('');
  const session = sessionId ? state.listens.find((l) => l.id === sessionId) : undefined;
  const save = (patch: Partial<ListenSession>) => {
    if (!session) return;
    const next = { ...session, ...patch };
    update((s) => ({ ...s, listens: s.listens.map((l) => (l.id === next.id ? next : l)) }));
  };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const player = useDialoguePlayer(session?.accent || prefs.accent);
  const [plays, setPlays] = useState(0);
  const [choices, setChoices] = useState<number[]>([]);
  const [dictPlays, setDictPlays] = useState(0);
  const [dictText, setDictText] = useState('');
  const [retell, setRetell] = useState('');
  const [samples, setSamples] = useState<SpeechSample[]>([]);
  const [clips, setClips] = useState<AudioClip[]>([]);
  const [pron, setPron] = useState<PronunciationResult>();
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [scoring, setScoring] = useState(false);
  const [retellError, setRetellError] = useState('');
  const topRef = useRef<HTMLDivElement>(null);
  const fluency = useMemo(() => withAudioFluency(analyzeFluency(samples), pron), [samples, pron]);
  useEffect(() => { if (!retell.trim()) { setSamples([]); setClips([]); setPron(undefined); } }, [retell]);

  // Reset local inputs when switching sessions.
  useEffect(() => {
    player.stop();
    setPlays(0);
    setChoices(session?.answers || []);
    setDictPlays(0);
    setDictText(session?.dictationText || '');
    setRetell('');
    setSamples([]);
    setClips([]);
    setPron(undefined);
    setTimeLeft(null);
    setRetellError('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  // 60-second retell timer
  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const t = setTimeout(() => setTimeLeft((x) => (x === null ? null : x - 1)), 1000);
    return () => clearTimeout(t);
  }, [timeLeft]);

  async function start(topic = topicLabel) {
    if (!topic) return;
    setLoading(true);
    setError('');
    try {
      const plain = topic.replace(/^\p{Extended_Pictographic}\uFE0F?\s*/u, '');
      const drill = await listenDrill(ai, state.profile, plain, prefs.level, 75, state.listens.map((l) => l.drill.title));
      const s: ListenSession = { id: uid(), date: todayStr(), topic, accent: prefs.accent, speed: prefs.speed, level: prefs.level, drill, createdAt: Date.now() };
      update((st) => ({ ...st, listens: [...st.listens, s] }));
      setSessionId(s.id);
      logActivity();
      setTimeout(() => topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setLoading(false);
    }
  }
  const surprise = () => {
    const pool = topics.filter((t) => `${t.emoji} ${t.name}` !== prefs.topic);
    const t = (pool.length ? pool : topics)[Math.floor(Math.random() * (pool.length || topics.length))];
    if (!t) return;
    const label = `${t.emoji} ${t.name}`;
    setCustom('');
    setPrefs({ topic: label });
    start(label);
  };

  const d = session?.drill;
  const checked = session?.questionScore != null;
  const checkAnswers = () => {
    if (!d) return;
    const score = d.questions.reduce((n, q, i) => n + (choices[i] === q.answer ? 1 : 0), 0);
    save({ answers: d.questions.map((_, i) => choices[i] ?? -1), questionScore: score });
    logActivity();
  };

  const playDictation = async () => {
    if (!d || dictPlays >= MAX_DICTATION_PLAYS) return;
    setDictPlays((n) => n + 1);
    const v = dialogueVoices(session!.accent)[0];
    stopSpeaking();
    await speakWith(d.dictation, { voice: v.voice, rate: Math.min(1, session!.speed), lang: session!.accent === 'UK' ? 'en-GB' : 'en-US' });
  };
  const checkDictation = () => {
    if (!d || !dictText.trim()) return;
    save({ dictationText: dictText.trim(), dictationAccuracy: matchScore(d.dictation, dictText.trim()).score });
    logActivity();
  };
  const dictDiff = useMemo(() => (d && session?.dictationText != null ? wordDiff(session.dictationText, d.dictation) : null), [d, session?.dictationText]);

  const doRetell = async () => {
    if (!d || !retell.trim()) return;
    setScoring(true);
    setRetellError('');
    try {
      const r = await scoreRetell(ai, d, retell.trim());
      if (fluency) r.fluency = fluency;
      save({ retell: r, ...(pron ? { pronunciation: pron } : {}) });
      setTimeLeft(null);
      logActivity();
    } catch (e) {
      setRetellError(errorText(e));
    } finally {
      setScoring(false);
    }
  };

  const recent = [...state.listens].sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  const fallbackVoice = player.voices.some((v) => v.fallback);

  return (
    <div className="space-y-4">
      <PageTitle title="Listen" subtitle="Hear a real-sounding chat, answer, write what you hear, then retell it." />

      <Step n={1} title="Set up your drill">
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Topic</p>
          <div className="flex flex-wrap gap-2">
            {topics.map((t) => {
              const label = `${t.emoji} ${t.name}`;
              return <button key={t.id} className={pill(!custom.trim() && prefs.topic === label)} onClick={() => { setPrefs({ topic: label }); setCustom(''); }}>{label}</button>;
            })}
          </div>
          <input className="input mt-2" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="…or type your own topic (e.g. football, coffee, side projects)" maxLength={60} />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Accent</p>
            <div className="flex gap-2">{(['US', 'UK'] as Accent[]).map((a) => <button key={a} className={pill(prefs.accent === a)} onClick={() => setPrefs({ accent: a })}>{a === 'US' ? '🇺🇸 US' : '🇬🇧 UK'}</button>)}</div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Speed</p>
            <div className="flex gap-2">{SPEEDS.map((s) => <button key={s} className={pill(prefs.speed === s)} onClick={() => setPrefs({ speed: s })}>{s}x</button>)}</div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Level</p>
            <div className="flex gap-2">{LEVELS.map((l) => <button key={l} className={pill(prefs.level === l)} onClick={() => setPrefs({ level: l })}>{l}</button>)}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" onClick={() => start()} disabled={!topicLabel || loading}>{loading ? <Spinner /> : <Icon name="ear" className="h-4 w-4" />} Start listening</button>
          <button className="btn-soft" onClick={surprise} disabled={loading || !topics.length}>🎲 Surprise me</button>
        </div>
        {!topicLabel && <p className="muted text-xs">Pick a topic chip or type one to start.</p>}
        {loading && <p className="muted flex items-center gap-2"><Spinner /> Writing a dialogue for you…</p>}
        <ErrorBox error={error} onRetry={() => start()} />
      </Step>

      {session && d && (
        <div ref={topRef} className="scroll-mt-20 space-y-4">
          <Step n={2} title="Listen and answer" right={<span className="chip bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200">{session.accent} · {session.speed}x</span>}>
            <div className="rounded-xl bg-gradient-to-r from-blue-600 to-sky-500 p-4 text-white dark:from-blue-700 dark:to-sky-700">
              <p className="text-xs uppercase tracking-wide opacity-80">{session.topic} · {session.level}</p>
              <p className="text-lg font-semibold">🎧 {d.title}</p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                {player.playing && !checked ? (
                  <button className="btn bg-white/95 text-blue-700 hover:bg-white" onClick={player.stop}><Icon name="stop" className="h-4 w-4" /> Stop</button>
                ) : (
                  <button className="btn bg-white/95 text-blue-700 hover:bg-white" onClick={() => { setPlays((n) => n + 1); player.play(d.lines, session.speed); }} disabled={!ttsSupported()}>
                    <Icon name="play" className="h-4 w-4" /> {plays ? 'Play again' : 'Play dialogue'}
                  </button>
                )}
                {player.playing && player.current >= 0 && (
                  <span className="flex items-center gap-2 text-sm">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold ${d.lines[player.current].speaker === 'Sam' ? 'bg-violet-200 text-violet-900' : 'bg-amber-200 text-amber-900'}`}>{d.lines[player.current].speaker[0]}</span>
                    Line {player.current + 1} of {d.lines.length}
                  </span>
                )}
                {!player.playing && <span className="text-xs opacity-90">{d.lines.length} lines · Alex & Sam · text hidden</span>}
              </div>
            </div>
            {!ttsSupported() && <p className="text-sm text-amber-700 dark:text-amber-300">This browser can't read text aloud. Try Chrome, Edge or Safari.</p>}
            {fallbackVoice && ttsSupported() && <p className="muted text-xs">No {session.accent === 'UK' ? 'British' : 'American'} voice on this device for both speakers, so I'm using the closest English voice.</p>}

            <div className="space-y-4">
              {d.questions.map((q, i) => (
                <div key={i}>
                  <p className="mb-2 text-sm font-semibold">{i + 1}. {q.q}</p>
                  <div className="grid gap-2">
                    {q.options.map((o, k) => {
                      const picked = choices[i] === k;
                      const right = checked && k === q.answer;
                      const wrong = checked && picked && k !== q.answer;
                      return (
                        <button
                          key={k}
                          disabled={checked}
                          onClick={() => setChoices((c) => { const n = [...c]; n[i] = k; return n; })}
                          className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm transition ${right ? 'border-emerald-500 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100' : wrong ? 'border-rose-400 bg-rose-50 text-rose-900 dark:bg-rose-950/40 dark:text-rose-100' : picked ? 'border-blue-600 bg-blue-50 dark:border-blue-400 dark:bg-blue-950/50' : 'border-slate-200 hover:border-blue-300 dark:border-slate-700'}`}
                        >
                          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold">{right ? '✓' : wrong ? '✗' : String.fromCharCode(65 + k)}</span>
                          {o}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {!checked ? (
              <button className="btn-primary" onClick={checkAnswers} disabled={d.questions.some((_, i) => choices[i] == null)}><Icon name="check" className="h-4 w-4" /> Check answers</button>
            ) : (
              <p className="rounded-xl bg-slate-50 p-3 text-sm font-semibold dark:bg-slate-800/60">
                {session.questionScore === d.questions.length ? '🎉' : '👂'} {session.questionScore}/{d.questions.length} correct{session.questionScore === d.questions.length ? '. Great listening!' : '. Replay it slowly with the text below to catch what you missed.'}
              </p>
            )}
          </Step>

          {checked && (
            <Step n={3} title="Replay slowly with the text">
              <div className="flex flex-wrap items-center gap-2">
                {player.playing ? (
                  <button className="btn-primary !px-3" onClick={player.stop}><Icon name="stop" className="h-4 w-4" /> Stop</button>
                ) : (
                  <button className="btn-primary !px-3" onClick={() => player.play(d.lines, prefs.slow)}><Icon name="play" className="h-4 w-4" /> Replay at {prefs.slow}x</button>
                )}
                <span className="text-xs text-slate-500">Speed</span>
                {SLOW_SPEEDS.map((s) => <button key={s} className={pill(prefs.slow === s) + ' !px-2.5 !py-1 text-xs'} onClick={() => setPrefs({ slow: s })}>{s}x</button>)}
              </div>
              <ol className="space-y-2">
                {d.lines.map((l, i) => (
                  <li key={i} className={`flex items-start gap-2 rounded-xl p-2 transition ${player.current === i ? 'bg-blue-50 ring-2 ring-blue-300 dark:bg-blue-950/50 dark:ring-blue-700' : ''}`}>
                    <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${l.speaker === 'Sam' ? 'bg-violet-100 text-violet-800 dark:bg-violet-900/50 dark:text-violet-200' : 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200'}`} title={l.speaker}>{l.speaker[0]}</span>
                    <p className="flex-1 text-[15px] leading-relaxed">
                      <span className="mr-1 text-xs font-semibold text-slate-400">{l.speaker}</span>
                      {markPhrases(l.text, d.phrases.map((p) => p.phrase)).map((c, j) => (c.hit ? <mark key={j} className="mark-phrase">{c.text}</mark> : <span key={j}>{c.text}</span>))}
                    </p>
                    <button className="btn-ghost !p-1.5" title="Play this line" aria-label={`Play line ${i + 1}`} onClick={() => player.play(d.lines, prefs.slow, i, true)}><Icon name="play" className="h-4 w-4" /></button>
                  </li>
                ))}
              </ol>
              <PhraseCards phrases={d.phrases} source={`Listen: ${d.title}`} />
            </Step>
          )}

          {checked && (
            <Step n={4} title="Dictation" right={<span className="muted text-xs">Plays: {dictPlays}/{MAX_DICTATION_PLAYS}</span>}>
              <p className="muted">Listen to one sentence from the chat (up to 3 times) and type exactly what you hear.</p>
              <button className="btn-soft" onClick={playDictation} disabled={dictPlays >= MAX_DICTATION_PLAYS || session.dictationText != null}><Icon name="play" className="h-4 w-4" /> {dictPlays ? 'Play again' : 'Play sentence'}</button>
              <textarea className="input" rows={2} value={dictText} onChange={(e) => setDictText(e.target.value)} placeholder="Type the sentence you heard…" disabled={session.dictationText != null} />
              {session.dictationText == null ? (
                <button className="btn-primary" onClick={checkDictation} disabled={!dictText.trim()}><Icon name="check" className="h-4 w-4" /> Check</button>
              ) : dictDiff && (
                <div className="space-y-2 rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-700">
                  <div className="flex items-center gap-3">
                    <ScoreRing score={session.dictationAccuracy ?? 0} size="h-12 w-12" />
                    <p className="font-semibold">{session.dictationAccuracy}% of the words correct</p>
                  </div>
                  <p><span className="text-xs font-semibold text-slate-500">You wrote: </span>{dictDiff.left.map((p, i) => <span key={i} className={p.type === 'removed' ? 'rounded bg-orange-100 px-0.5 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200' : ''}>{p.text} </span>)}</p>
                  <p><span className="text-xs font-semibold text-slate-500">Sentence: </span>{dictDiff.right.map((p, i) => <span key={i} className={p.type === 'added' ? 'rounded bg-rose-100 px-0.5 font-semibold text-rose-700 dark:bg-rose-900/40 dark:text-rose-200' : ''}>{p.text} </span>)}</p>
                  <p className="text-xs text-slate-500"><span className="text-rose-600">Red</span> = words you missed · <span className="text-orange-600">orange</span> = words you wrote differently</p>
                </div>
              )}
            </Step>
          )}

          {checked && (
            <Step n={5} title="Retell it in 60 seconds" right={timeLeft !== null && <span className={`chip font-mono ${timeLeft <= 10 ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200'}`}>⏱️ {timeLeft > 0 ? `0:${String(timeLeft).padStart(2, '0')}` : "Time's up"}</span>}>
              <p className="muted">Say what Alex and Sam talked about, in your own words. Try to use the phrases above.</p>
              {session.retell ? (
                <>
                  <RetellCard s={session} showPron={false} />
                  {(session.pronunciation || clips.length > 0) && (
                    <PronunciationCard clips={retell.trim() === session.retell.retell.trim() ? clips : []} transcript={session.retell.retell} result={session.pronunciation}
                      onResult={(r) => { const f = withAudioFluency(session.retell?.fluency, r); save({ pronunciation: r, ...(session.retell ? { retell: { ...session.retell, ...(f ? { fluency: f } : {}) } } : {}) }); }}
                      context="retelling a short dialogue they just heard" accent={session.accent} title="🗣️ Pronunciation (your retell)" />
                  )}
                </>
              ) : (
                <>
                  {timeLeft === null && <button className="btn-soft" onClick={() => { player.stop(); setTimeLeft(RETELL_SECONDS); }}><Icon name="mic" className="h-4 w-4" /> Start 60s retell</button>}
                  {timeLeft !== null && (
                    <>
                      <MicInput value={retell} onChange={setRetell} onSpeech={(s) => setSamples((a) => [...a, s])} onAudio={(c) => { setClips((a) => [...a, c]); setPron(undefined); }} placeholder="Tap the mic and retell the chat, or type…" rows={4} />
                      {fluency && <FluencyCard stats={fluency} title="📈 Fluency (this retell)" />}
                      <PronunciationCard clips={clips} transcript={retell} result={pron} onResult={setPron} context="retelling a short dialogue they just heard" accent={session.accent} title="🗣️ Pronunciation (this retell)" />
                      <button className="btn-primary" onClick={doRetell} disabled={!retell.trim() || scoring}>{scoring ? <Spinner /> : <Icon name="check" className="h-4 w-4" />} Score my retell</button>
                    </>
                  )}
                  <ErrorBox error={retellError} onRetry={doRetell} />
                </>
              )}
            </Step>
          )}
          {session.retell?.modelRetell && <ShadowCard text={session.retell.modelRetell} phrases={d.phrases.map((p) => p.phrase)} title="🗣️ Shadow the model retell" />}
        </div>
      )}

      {recent.length > 0 && (
        <section className="card">
          <h2 className="h-section mb-2">Recent drills</h2>
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {recent.map((l) => (
              <li key={l.id}>
                <button className={`flex w-full items-center gap-3 py-2 text-left ${l.id === sessionId ? 'text-blue-700 dark:text-blue-300' : ''}`} onClick={() => setSessionId(l.id)}>
                  <span className="flex-1">
                    <span className="block text-sm font-medium">{l.drill.title}</span>
                    <span className="block text-xs text-slate-500">{l.date} · {l.topic} · {l.accent} {l.speed}x</span>
                  </span>
                  <ListenBadges s={l} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function ListenBadges({ s }: { s: ListenSession }) {
  return (
    <span className="flex flex-wrap justify-end gap-1">
      {s.questionScore != null && <span className="chip bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-200">Q {s.questionScore}/{s.drill.questions.length}</span>}
      {s.dictationAccuracy != null && <span className="chip bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-200">✍️ {s.dictationAccuracy}%</span>}
      {s.retell && <span className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">Retell {s.retell.score}</span>}
    </span>
  );
}

export function RetellCard({ s, showPron = true }: { s: ListenSession; showPron?: boolean }) {
  const r = s.retell!;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <ScoreRing score={r.score} />
        <div className="text-sm">
          <p className="font-semibold">{r.ideasCovered.length}/{r.ideasCovered.length + r.ideasMissed.length || s.drill.keyIdeas.length} key ideas · {r.phrasesUsed.length} phrase{r.phrasesUsed.length === 1 ? '' : 's'} used</p>
          {r.praise && <p className="text-slate-600 dark:text-slate-300">{r.praise}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {r.ideasCovered.map((p) => <span key={p} className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">✓ {p}</span>)}
        {r.ideasMissed.map((p) => <span key={p} className="chip bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">○ {p}</span>)}
      </div>
      {r.phrasesUsed.length > 0 && <p className="text-sm">💬 Phrases you used: {r.phrasesUsed.map((p) => <mark key={p} className="mark-phrase mr-1">{p}</mark>)}</p>}
      <p className="rounded-lg bg-slate-50 p-2.5 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">“{r.retell}”</p>
      {r.fluency && <FluencyCard stats={r.fluency} title="📈 Fluency (your retell)" />}
      {showPron && s.pronunciation && <PronunciationCard accent={s.accent} clips={[]} transcript={r.retell} result={s.pronunciation} title="🗣️ Pronunciation (your retell)" />}
      {r.tip && <p className="rounded-lg bg-blue-50 p-2.5 text-sm text-blue-900 dark:bg-blue-950/50 dark:text-blue-100">💡 <b>Tip:</b> {r.tip}</p>}
      {r.modelRetell && (
        <div>
          <p className="mb-2 text-sm font-semibold">🎧 Model retell</p>
          <ListenPlayer text={r.modelRetell} phrases={s.drill.phrases.map((p) => p.phrase)} />
        </div>
      )}
    </div>
  );
}
