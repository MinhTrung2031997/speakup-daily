import { useEffect, useRef, useState } from 'react';
import { useStore } from '../lib/store';
import { todaysPhrases, todaysQuestion, useAIConfig } from '../lib/hooks';
import { chatFeedback, chatReply } from '../lib/ai';
import { errorText } from '../lib/gemini';
import { todayStr, uid } from '../lib/date';
import { speak, stopSpeaking, ttsSupported } from '../lib/speech';
import { markPhrases } from '../lib/diff';
import type { ChatMessage, ChatSession } from '../lib/types';
import MicInput from '../components/MicInput';
import ShadowPractice from '../components/ShadowPractice';
import { ErrorBox, NoKeyBanner, PageTitle, Spinner } from '../components/ui';
import Icon from '../components/Icon';

export default function Chat() {
  const { state, update, logActivity } = useStore();
  const ai = useAIConfig();
  const q = todaysQuestion(state);
  const phrases = todaysPhrases(state);
  const topic = q?.topicName || 'Daily Life';
  const question = q?.question || 'How has your day been so far?';
  const [shadowIdx, setShadowIdx] = useState<number | null>(null);
  const session = [...state.chats].reverse().find((c) => c.date === todayStr() && !c.feedback);
  const lastDone = [...state.chats].reverse().find((c) => c.date === todayStr() && c.feedback);

  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState('');
  const [readAloud, setReadAloud] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => stopSpeaking(), []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [session?.messages.length, busy]);

  const say = (t: string) => {
    if (readAloud && ttsSupported()) {
      stopSpeaking();
      speak(t, { voiceURI: state.settings.voiceURI, rate: state.settings.rate });
    }
  };

  const saveSession = (s: ChatSession) =>
    update((st) => ({ ...st, chats: st.chats.some((c) => c.id === s.id) ? st.chats.map((c) => (c.id === s.id ? s : c)) : [...st.chats, s] }));

  const start = async () => {
    setBusy(true);
    setError('');
    try {
      const first = await chatReply(ai, state.profile, topic, question, phrases, []);
      const s: ChatSession = { id: uid(), date: todayStr(), topicName: topic, question, messages: [first], createdAt: Date.now() };
      saveSession(s);
      say(first.text);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    const msg = text.trim();
    if (!msg || !session || busy) return;
    const msgs: ChatMessage[] = [...session.messages, { role: 'user', text: msg }];
    const withUser = { ...session, messages: msgs };
    saveSession(withUser);
    setText('');
    setBusy(true);
    setError('');
    try {
      const reply = await chatReply(ai, state.profile, topic, question, phrases, msgs);
      saveSession({ ...withUser, messages: [...msgs, reply] });
      logActivity();
      say(reply.text);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const end = async () => {
    if (!session) return;
    stopSpeaking();
    setEnding(true);
    setError('');
    try {
      const fb = await chatFeedback(ai, topic, phrases, session.messages);
      saveSession({ ...session, feedback: fb });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setEnding(false);
    }
  };

  const userTurns = session?.messages.filter((m) => m.role === 'user').length || 0;

  return (
    <div className="space-y-4">
      <PageTitle
        title="Conversation practice"
        subtitle={`Topic: ${topic}`}
        right={
          ttsSupported() ? (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input type="checkbox" checked={readAloud} onChange={(e) => { setReadAloud(e.target.checked); if (!e.target.checked) stopSpeaking(); }} className="accent-blue-600" />
              Read replies aloud
            </label>
          ) : undefined
        }
      />
      {!ai.hasKey && <NoKeyBanner />}

      {phrases.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-slate-500">Try to use:</span>
          {phrases.map((p) => <span key={p} className="chip bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-200">{p}</span>)}
        </div>
      )}

      {!session ? (
        <div className="space-y-4">
          {lastDone?.feedback && <FeedbackCard session={lastDone} />}
          <div className="card flex flex-col items-center gap-3 py-10 text-center">
            <div className="text-4xl">💬</div>
            <p className="font-semibold">{lastDone ? 'Ready for another round?' : 'Chat like you would on Discord'}</p>
            <p className="muted max-w-sm">Your partner will ask about today's topic and follow up naturally. Talk with the mic or type. Short, relaxed answers are perfect.</p>
            <button className="btn-primary" onClick={start} disabled={busy || !ai.hasKey}>{busy ? <Spinner /> : <Icon name="chat" className="h-4 w-4" />} Start chatting</button>
            <ErrorBox error={error} onRetry={start} />
          </div>
        </div>
      ) : (
        <div className="card flex flex-col gap-3 !p-3 sm:!p-4">
          <div className="space-y-3">
            {session.messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className="max-w-[85%] space-y-1">
                  <div className={`rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed ${m.role === 'user' ? 'rounded-br-md bg-blue-600 text-white dark:bg-blue-500 dark:text-slate-950' : 'rounded-bl-md bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-100'}`}>
                    {m.role === 'user'
                      ? markPhrases(m.text, phrases).map((c, j) => (c.hit ? <b key={j} className="underline decoration-amber-300 decoration-2 underline-offset-2">{c.text}</b> : <span key={j}>{c.text}</span>))
                      : m.text}
                    {m.role === 'model' && ttsSupported() && (
                      <button onClick={() => { stopSpeaking(); speak(m.text, { voiceURI: state.settings.voiceURI, rate: state.settings.rate }); }} className="ml-2 inline-flex align-middle text-slate-400 hover:text-blue-600" title="Play">
                        <Icon name="play" className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                  {m.nudge && <p className="px-1 text-xs text-amber-700 dark:text-amber-300">💡 {m.nudge}</p>}
                  {m.role === 'model' && shadowIdx !== i && (
                    <button className="px-1 text-xs font-medium text-blue-600 hover:underline dark:text-blue-300" onClick={() => setShadowIdx(i)}>🗣️ Shadow this</button>
                  )}
                  {m.role === 'model' && shadowIdx === i && (
                    <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-700">
                      <ShadowPractice key={m.text} text={m.text} phrases={phrases} onClose={() => setShadowIdx(null)} />
                    </div>
                  )}
                </div>
              </div>
            ))}
            {busy && <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner className="h-3.5 w-3.5" /> typing…</div>}
            <div ref={bottomRef} />
          </div>
          <ErrorBox error={error} onRetry={userTurns ? undefined : start} />
          <MicInput value={text} onChange={setText} onSend={send} sendDisabled={!text.trim() || busy} rows={2} placeholder="Reply by voice or text… (Enter to send)" />
          <div className="flex items-center justify-between">
            <span className="muted text-xs">{userTurns} message{userTurns === 1 ? '' : 's'} from you</span>
            <button className="btn-soft" onClick={end} disabled={ending || userTurns < 1}>{ending ? <Spinner /> : <Icon name="check" className="h-4 w-4" />} End &amp; get feedback</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function FeedbackCard({ session }: { session: ChatSession }) {
  const fb = session.feedback!;
  return (
    <div className="card space-y-3 border-emerald-200 dark:border-emerald-900">
      <h2 className="h-section">🎉 Chat feedback</h2>
      {fb.summary && <p className="text-sm">{fb.summary}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Nice!</p>
          <ul className="space-y-1 text-sm">{fb.goodPoints.map((g) => <li key={g}>✅ {g}</li>)}</ul>
        </div>
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-blue-700 dark:text-blue-300">Next time</p>
          <ul className="space-y-1 text-sm">{fb.improve.map((g) => <li key={g}>👉 {g}</li>)}</ul>
        </div>
      </div>
      {fb.phrasesUsed.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <span className="text-xs text-slate-500">Phrases you used:</span>
          {fb.phrasesUsed.map((p) => <span key={p} className="chip bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">✓ {p}</span>)}
        </div>
      )}
    </div>
  );
}
