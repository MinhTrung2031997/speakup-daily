/**
 * Supabase data layer.
 *
 * The UI keeps working with one in-memory AppState (same shape as the old browser-storage
 * version). This module:
 *   - loadState():  reads every table for the signed-in user and builds an AppState
 *   - syncChanges(): diffs two AppStates and writes only what changed
 *   - importLegacy(): copies an old browser/JSON backup into the database (deduped by client_id)
 *   - saveShadowAttempt(), resetAll()
 * Items are compared by reference, so every state change must be immutable (it already is).
 */
import type { Json } from '../../supabase/database.types';
import { supabase } from './supabase';
import { cleanPhrase } from './diff';
import { isUuid, todayStr, uid } from './date';
import { getDemoMode } from './gemini';
import type {
  AppState, BuilderInfo, ChatFeedback, ChatMessage, ChatSession, DailyQuestion, Entry, FluencyStats, Phrase, Profile,
  RetryResult, ReviewLog, Settings, ShadowAttemptInput, Topic, Upgrade,
} from './types';

export const PRESET_TOPICS: Topic[] = [
  { id: 'work', name: 'Work & Career', emoji: '💼', active: true },
  { id: 'tech', name: 'Technology', emoji: '💻', active: true },
  { id: 'daily', name: 'Daily Life', emoji: '☕', active: true },
  { id: 'travel', name: 'Travel', emoji: '✈️', active: true },
  { id: 'opinions', name: 'Opinions & Debates', emoji: '🗣️', active: true },
  { id: 'hobbies', name: 'Hobbies', emoji: '🎮', active: true },
  { id: 'food', name: 'Food & Culture', emoji: '🍜', active: true },
];

export const DEFAULT_PROFILE: Profile = { name: '', job: '', city: '', hobbies: '', goals: '', level: 'B1–B2 (intermediate)', facts: '' };

const j = (v: unknown) => v as unknown as Json;
const ts = (ms: number | undefined) => new Date(ms && Number.isFinite(ms) ? ms : Date.now()).toISOString();
const ms = (iso: string) => Date.parse(iso) || Date.now();
const date = (d: string | undefined) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : todayStr());
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || d);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const phraseKey = (p: string) => cleanPhrase(p).toLowerCase();

function check<T extends { error: { message: string } | null }>(r: T, what: string): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r;
}

function chunks<T>(arr: T[], size = 400): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Read every row of a table (PostgREST returns at most 1000 rows per request). */
async function fetchAll<R>(table: string, columns: string, order: string): Promise<R[]> {
  const out: R[] = [];
  const page = 1000;
  for (let from = 0; ; from += page) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await (supabase.from(table as any) as any).select(columns).order(order, { ascending: true }).range(from, from + page - 1);
    if (r.error) throw new Error(`Load ${table}: ${r.error.message}`);
    out.push(...(r.data as R[]));
    if (!r.data || r.data.length < page) break;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Topic slug <-> uuid map (the app uses slugs like 'work' as topic ids)
// ---------------------------------------------------------------------------
const topicIds = new Map<string, string>(); // slug -> uuid
const topicSlugs = new Map<string, string>(); // uuid -> slug
function rememberTopic(slug: string, id: string) {
  topicIds.set(slug, id);
  topicSlugs.set(id, slug);
}

// ---------------------------------------------------------------------------
// Row mappers
// ---------------------------------------------------------------------------
function fluencyFromRow(r: FluencyRow): FluencyStats {
  return {
    words: r.words,
    seconds: num(r.duration_seconds),
    wpm: num(r.wpm),
    fillers: r.filler_count,
    fillerWords: (r.filler_words && typeof r.filler_words === 'object' && !Array.isArray(r.filler_words) ? r.filler_words : {}) as Record<string, number>,
    restarts: r.restarts,
    restartExamples: r.restart_examples || [],
    pauses: r.long_pauses,
    longestPause: num(r.longest_pause_seconds),
    tip: r.tip,
    createdAt: ms(r.created_at),
  };
}

function fluencyRow(userId: string, answerId: string, kind: 'answer' | 'retry', f: FluencyStats, day: string) {
  return {
    user_id: userId,
    answer_id: answerId,
    kind,
    words: Math.max(0, Math.round(num(f.words))),
    duration_seconds: clamp(num(f.seconds), 0, 99999),
    wpm: clamp(num(f.wpm), 0, 99999),
    filler_count: Math.max(0, Math.round(num(f.fillers))),
    filler_words: j(f.fillerWords || {}),
    restarts: Math.max(0, Math.round(num(f.restarts))),
    restart_examples: f.restartExamples || [],
    long_pauses: Math.max(0, Math.round(num(f.pauses))),
    longest_pause_seconds: clamp(num(f.longestPause), 0, 9999),
    tip: f.tip || '',
    recorded_date: date(day),
    created_at: ts(f.createdAt),
  };
}

function questionRow(userId: string, q: DailyQuestion, clientId?: string) {
  return {
    id: q.id,
    user_id: userId,
    ...(clientId ? { client_id: clientId } : {}),
    topic_id: topicIds.get(q.topicId) ?? null,
    topic_name: q.topicName || '',
    question: q.question || '(no question)',
    starters: q.starters || [],
    question_date: date(q.date),
    created_at: ts(q.createdAt),
  };
}

function answerRow(userId: string, e: Entry, questionId: string | null, clientId?: string) {
  const retry = e.retry ? (({ fluency: _f, ...rest }) => rest)(e.retry) : null;
  return {
    id: e.id,
    user_id: userId,
    ...(clientId ? { client_id: clientId } : {}),
    question_id: questionId,
    question: e.question || '',
    topic_name: e.topicName || '',
    answer: e.answer || '',
    upgrade: e.upgrade ? j(e.upgrade) : null,
    retry: retry ? j(retry) : null,
    retry_score: e.retry ? clamp(Math.round(num(e.retry.score)), 0, 100) : null,
    builder: e.builder ? j(e.builder) : null,
    input_mode: e.fluency ? 'voice' : 'text',
    answer_date: date(e.date),
    created_at: ts(e.createdAt),
  };
}

function phraseRow(userId: string, p: Phrase, clientId?: string) {
  return {
    id: p.id,
    user_id: userId,
    ...(clientId ? { client_id: clientId } : {}),
    phrase: cleanPhrase(p.phrase).slice(0, 200) || p.phrase.slice(0, 200),
    meaning: p.meaning || '',
    example: p.example || '',
    source: p.source || '',
    added_date: date(p.addedDate),
    stage: clamp(Math.round(num(p.stage)), 0, 5),
    due: date(p.due),
    last_reviewed_at: p.reviews?.length ? `${date(p.reviews[p.reviews.length - 1].date)}T12:00:00Z` : null,
    created_at: ts(p.createdAt),
  };
}

function reviewRows(userId: string, phraseId: string, reviews: ReviewLog[]) {
  return reviews.map((r) => ({ user_id: userId, phrase_id: phraseId, review_date: date(r.date), sentence: r.sentence || '', ok: !!r.ok, feedback: r.feedback || '' }));
}

function chatRow(userId: string, c: ChatSession, clientId?: string) {
  return {
    id: c.id,
    user_id: userId,
    ...(clientId ? { client_id: clientId } : {}),
    topic_name: c.topicName || '',
    question: c.question || '',
    feedback: c.feedback ? j(c.feedback) : null,
    session_date: date(c.date),
    created_at: ts(c.createdAt),
  };
}

function messageRows(userId: string, sessionId: string, msgs: ChatMessage[], from = 0) {
  return msgs.slice(from).map((m, i) => ({
    user_id: userId,
    session_id: sessionId,
    position: from + i,
    role: m.role === 'model' ? 'model' : 'user',
    text: m.text || '',
    nudge: m.nudge ?? null,
  }));
}

function settingsRow(userId: string, s: Settings) {
  return {
    user_id: userId,
    model: s.model || 'gemini-flash-lite-latest',
    dark: !!s.dark,
    voice_uri: s.voiceURI || '',
    rate: clamp(num(s.rate, 1), 0.5, 2),
    onboarded: !!s.onboarded,
    fast_mode: s.fastMode !== false,
  };
}

function topicRows(userId: string, topics: Topic[]) {
  return topics.map((t, i) => ({
    user_id: userId,
    slug: t.id,
    name: (t.name || 'Topic').slice(0, 80),
    emoji: t.emoji || '💬',
    active: !!t.active,
    is_custom: !!t.custom,
    sort_order: i + 1,
  }));
}

// Row types (only the columns we read)
interface FluencyRow {
  answer_id: string | null; kind: string; words: number; duration_seconds: number; wpm: number; filler_count: number;
  filler_words: Json; restarts: number; restart_examples: string[]; long_pauses: number; longest_pause_seconds: number;
  tip: string; created_at: string;
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------
export async function loadState(userId: string): Promise<AppState> {
  const [profileR, settingsR] = await Promise.all([
    supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
  ]);
  check(profileR, 'Load profile');
  check(settingsR, 'Load settings');

  const [topics, questions, answers, fluency, phrases, reviews, chats, messages, activity] = await Promise.all([
    fetchAll<{ id: string; slug: string; name: string; emoji: string; active: boolean; is_custom: boolean; sort_order: number }>('topics', 'id,slug,name,emoji,active,is_custom,sort_order', 'sort_order'),
    fetchAll<{ id: string; topic_id: string | null; topic_name: string; question: string; starters: string[]; question_date: string; created_at: string }>('daily_questions', 'id,topic_id,topic_name,question,starters,question_date,created_at', 'created_at'),
    fetchAll<{ id: string; question_id: string | null; question: string; topic_name: string; answer: string; upgrade: Json; retry: Json; builder: Json; answer_date: string; created_at: string }>('answers', 'id,question_id,question,topic_name,answer,upgrade,retry,builder,answer_date,created_at', 'created_at'),
    fetchAll<FluencyRow>('fluency_stats', 'answer_id,kind,words,duration_seconds,wpm,filler_count,filler_words,restarts,restart_examples,long_pauses,longest_pause_seconds,tip,created_at', 'created_at'),
    fetchAll<{ id: string; phrase: string; meaning: string; example: string; source: string; added_date: string; stage: number; due: string; created_at: string }>('phrases', 'id,phrase,meaning,example,source,added_date,stage,due,created_at', 'created_at'),
    fetchAll<{ phrase_id: string; review_date: string; sentence: string; ok: boolean; feedback: string }>('phrase_reviews', 'phrase_id,review_date,sentence,ok,feedback,created_at', 'created_at'),
    fetchAll<{ id: string; topic_name: string; question: string; feedback: Json; session_date: string; created_at: string }>('chat_sessions', 'id,topic_name,question,feedback,session_date,created_at', 'created_at'),
    fetchAll<{ session_id: string; position: number; role: string; text: string; nudge: string | null }>('chat_messages', 'session_id,position,role,text,nudge', 'position'),
    fetchAll<{ activity_date: string; seconds_spoken: number; practice_count: number }>('daily_activity', 'activity_date,seconds_spoken,practice_count', 'activity_date'),
  ]);

  topicIds.clear();
  topicSlugs.clear();
  topics.forEach((t) => rememberTopic(t.slug, t.id));

  const p = profileR.data;
  const s = settingsR.data;
  const flu = new Map<string, FluencyStats>();
  fluency.forEach((f) => f.answer_id && (f.kind === 'answer' || f.kind === 'retry') && flu.set(`${f.answer_id}:${f.kind}`, fluencyFromRow(f)));
  const revBy = new Map<string, ReviewLog[]>();
  reviews.forEach((r) => revBy.set(r.phrase_id, [...(revBy.get(r.phrase_id) || []), { date: r.review_date, sentence: r.sentence, ok: r.ok, feedback: r.feedback }]));
  const msgBy = new Map<string, ChatMessage[]>();
  messages.forEach((m) => {
    const list = msgBy.get(m.session_id) || [];
    list.push({ role: m.role === 'model' ? 'model' : 'user', text: m.text, ...(m.nudge ? { nudge: m.nudge } : {}) });
    msgBy.set(m.session_id, list);
  });

  const speakingLog: Record<string, number> = {};
  const activityLog: Record<string, number> = {};
  activity.forEach((a) => {
    if (num(a.seconds_spoken)) speakingLog[a.activity_date] = num(a.seconds_spoken);
    if (a.practice_count) activityLog[a.activity_date] = a.practice_count;
  });

  return {
    version: 1,
    profile: p ? { name: p.name, job: p.job, city: p.city, hobbies: p.hobbies, goals: p.goals, level: p.level, facts: p.facts } : { ...DEFAULT_PROFILE },
    topics: topics.map((t) => ({ id: t.slug, name: t.name, emoji: t.emoji, active: t.active, ...(t.is_custom ? { custom: true } : {}) })),
    settings: {
      model: s?.model || 'gemini-flash-lite-latest',
      dark: !!s?.dark,
      voiceURI: s?.voice_uri || '',
      rate: num(s?.rate, 1),
      onboarded: !!s?.onboarded,
      fastMode: s?.fast_mode !== false,
      demo: getDemoMode(),
    },
    questions: questions.map((q) => ({
      id: q.id, date: q.question_date, topicId: (q.topic_id && topicSlugs.get(q.topic_id)) || '', topicName: q.topic_name,
      question: q.question, starters: q.starters || [], createdAt: ms(q.created_at),
    })),
    entries: answers.map((a) => {
      const retryFlu = flu.get(`${a.id}:retry`);
      const retry = a.retry ? ({ ...(a.retry as unknown as RetryResult), ...(retryFlu ? { fluency: retryFlu } : {}) }) : undefined;
      const fl = flu.get(`${a.id}:answer`);
      return {
        id: a.id, date: a.answer_date, questionId: a.question_id || '', question: a.question, topicName: a.topic_name, answer: a.answer,
        ...(a.upgrade ? { upgrade: a.upgrade as unknown as Upgrade } : {}),
        ...(retry ? { retry } : {}),
        ...(fl ? { fluency: fl } : {}),
        ...(a.builder ? { builder: a.builder as unknown as BuilderInfo } : {}),
        createdAt: ms(a.created_at),
      } as Entry;
    }),
    // The UI shows the newest phrases first.
    phrases: phrases.reverse().map((x) => ({
      id: x.id, phrase: x.phrase, meaning: x.meaning, example: x.example, source: x.source, createdAt: ms(x.created_at),
      addedDate: x.added_date, stage: x.stage, due: x.due, reviews: revBy.get(x.id) || [],
    })),
    chats: chats.map((c) => ({
      id: c.id, date: c.session_date, topicName: c.topic_name, question: c.question, messages: msgBy.get(c.id) || [],
      ...(c.feedback ? { feedback: c.feedback as unknown as ChatFeedback } : {}), createdAt: ms(c.created_at),
    })),
    speakingLog,
    activityLog,
  };
}

// ---------------------------------------------------------------------------
// Diff + save
// ---------------------------------------------------------------------------
function byId<T extends { id: string }>(list: T[]) {
  return new Map(list.map((x) => [x.id, x]));
}

/** Write the difference between two states to the database. */
export async function syncChanges(userId: string, prev: AppState, next: AppState): Promise<void> {
  if (prev === next) return;

  if (prev.profile !== next.profile) {
    check(await supabase.from('profiles').upsert({ user_id: userId, ...next.profile }), 'Save profile');
  }
  const { demo: _a, ...ps } = prev.settings;
  const { demo: _b, ...ns } = next.settings;
  if (JSON.stringify(ps) !== JSON.stringify(ns)) {
    check(await supabase.from('user_settings').upsert(settingsRow(userId, next.settings)), 'Save settings');
  }

  // Topics (small list: upsert all when anything changes)
  if (prev.topics !== next.topics) {
    const r = check(await supabase.from('topics').upsert(topicRows(userId, next.topics), { onConflict: 'user_id,slug' }).select('id,slug'), 'Save topics');
    r.data?.forEach((t) => rememberTopic(t.slug, t.id));
    const keep = new Set(next.topics.map((t) => t.id));
    const gone = prev.topics.filter((t) => !keep.has(t.id)).map((t) => t.id);
    if (gone.length) {
      check(await supabase.from('topics').delete().eq('user_id', userId).in('slug', gone), 'Delete topics');
      gone.forEach((slug) => topicIds.delete(slug));
    }
  }

  // Questions
  if (prev.questions !== next.questions) {
    const old = byId(prev.questions);
    const changed = next.questions.filter((q) => old.get(q.id) !== q);
    for (const c of chunks(changed)) check(await supabase.from('daily_questions').upsert(c.map((q) => questionRow(userId, q))), 'Save questions');
    const ids = new Set(next.questions.map((q) => q.id));
    const gone = prev.questions.filter((q) => !ids.has(q.id)).map((q) => q.id);
    for (const c of chunks(gone)) check(await supabase.from('daily_questions').delete().in('id', c), 'Delete questions');
  }

  // Answers (+ their fluency stats)
  if (prev.entries !== next.entries) {
    const old = byId(prev.entries);
    const qids = new Set(next.questions.map((q) => q.id));
    const changed = next.entries.filter((e) => old.get(e.id) !== e);
    for (const c of chunks(changed)) {
      check(await supabase.from('answers').upsert(c.map((e) => answerRow(userId, e, qids.has(e.questionId) ? e.questionId : null))), 'Save answers');
    }
    for (const e of changed) {
      const o = old.get(e.id);
      for (const [kind, f, of] of [['answer', e.fluency, o?.fluency], ['retry', e.retry?.fluency, o?.retry?.fluency]] as const) {
        if (f === of) continue;
        if (f) check(await supabase.from('fluency_stats').upsert(fluencyRow(userId, e.id, kind, f, e.date), { onConflict: 'answer_id,kind' }), 'Save fluency');
        else if (of) check(await supabase.from('fluency_stats').delete().eq('answer_id', e.id).eq('kind', kind), 'Delete fluency');
      }
    }
    const ids = new Set(next.entries.map((e) => e.id));
    const gone = prev.entries.filter((e) => !ids.has(e.id)).map((e) => e.id);
    for (const c of chunks(gone)) check(await supabase.from('answers').delete().in('id', c), 'Delete answers');
  }

  // Phrases (+ new review logs)
  if (prev.phrases !== next.phrases) {
    const old = byId(prev.phrases);
    const ids = new Set(next.phrases.map((p) => p.id));
    const gone = prev.phrases.filter((p) => !ids.has(p.id)).map((p) => p.id);
    // Delete first so a removed-then-re-added phrase doesn't hit the unique (user, lower(phrase)) index.
    for (const c of chunks(gone)) check(await supabase.from('phrases').delete().in('id', c), 'Delete phrases');
    const changed = next.phrases.filter((p) => old.get(p.id) !== p);
    for (const c of chunks(changed)) check(await supabase.from('phrases').upsert(c.map((p) => phraseRow(userId, p))), 'Save phrases');
    const newReviews = changed.flatMap((p) => reviewRows(userId, p.id, p.reviews.slice(old.get(p.id)?.reviews.length ?? 0)));
    for (const c of chunks(newReviews)) check(await supabase.from('phrase_reviews').insert(c), 'Save reviews');
  }

  // Chats (+ messages)
  if (prev.chats !== next.chats) {
    const old = byId(prev.chats);
    const changed = next.chats.filter((c) => old.get(c.id) !== c);
    for (const c of chunks(changed)) check(await supabase.from('chat_sessions').upsert(c.map((x) => chatRow(userId, x))), 'Save chats');
    for (const c of changed) {
      const om = old.get(c.id)?.messages || [];
      const first = c.messages.findIndex((m, i) => om[i] !== m);
      if (first >= 0) check(await supabase.from('chat_messages').upsert(messageRows(userId, c.id, c.messages, first), { onConflict: 'session_id,position' }), 'Save messages');
      if (c.messages.length < om.length) check(await supabase.from('chat_messages').delete().eq('session_id', c.id).gte('position', c.messages.length), 'Trim messages');
    }
    const ids = new Set(next.chats.map((c) => c.id));
    const gone = prev.chats.filter((c) => !ids.has(c.id)).map((c) => c.id);
    for (const c of chunks(gone)) check(await supabase.from('chat_sessions').delete().in('id', c), 'Delete chats');
  }

  // Daily activity (streaks, minutes spoken)
  if (prev.speakingLog !== next.speakingLog || prev.activityLog !== next.activityLog) {
    const days = new Set([...Object.keys(next.speakingLog), ...Object.keys(next.activityLog)]);
    const rows = [...days]
      .filter((d) => prev.speakingLog[d] !== next.speakingLog[d] || prev.activityLog[d] !== next.activityLog[d])
      .map((d) => ({ user_id: userId, activity_date: d, seconds_spoken: Math.max(0, num(next.speakingLog[d])), practice_count: Math.max(0, Math.round(num(next.activityLog[d]))) }));
    for (const c of chunks(rows)) check(await supabase.from('daily_activity').upsert(c, { onConflict: 'user_id,activity_date' }), 'Save activity');
  }
}

// ---------------------------------------------------------------------------
// Shadowing attempts (+ optional recording upload)
// ---------------------------------------------------------------------------
const EXT: Record<string, string> = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/aac': 'aac' };

export async function saveShadowAttempt(userId: string, a: ShadowAttemptInput): Promise<void> {
  const id = uid();
  let recording_path: string | null = null;
  if (a.audioUrl) {
    try {
      const blob = await (await fetch(a.audioUrl)).blob();
      const type = (blob.type || 'audio/webm').split(';')[0];
      if (blob.size > 0 && blob.size < 10 * 1024 * 1024) {
        const path = `${userId}/shadowing/${todayStr()}/${id}.${EXT[type] || 'webm'}`;
        const up = await supabase.storage.from('recordings').upload(path, blob, { contentType: type, upsert: false });
        if (!up.error) recording_path = path;
        else console.warn('Recording upload failed:', up.error.message);
      }
    } catch (e) {
      console.warn('Recording upload failed:', e);
    }
  }
  check(await supabase.from('shadowing_attempts').insert({
    id,
    user_id: userId,
    source_text: a.sourceText,
    sentence_index: Math.max(0, a.sentenceIndex),
    sentence: a.sentence || '(sentence)',
    transcript: a.transcript || '',
    score: a.score == null ? null : clamp(Math.round(a.score), 0, 100),
    duration_seconds: clamp(num(a.seconds), 0, 99999),
    recording_path,
  }), 'Save shadowing attempt');
}

// ---------------------------------------------------------------------------
// Import old browser data / JSON backups (deduped with client_id)
// ---------------------------------------------------------------------------
export interface ImportSummary { questions: number; answers: number; phrases: number; chats: number }

async function clientMap(table: 'daily_questions' | 'answers' | 'phrases' | 'chat_sessions'): Promise<Map<string, string>> {
  const rows = await fetchAll<{ id: string; client_id: string | null }>(table, 'id,client_id', 'created_at');
  return new Map(rows.filter((r) => r.client_id).map((r) => [r.client_id as string, r.id]));
}

const isBlankProfile = (p: Profile) => !p.name && !p.job && !p.city && !p.hobbies && !p.goals && !p.facts;

export async function importLegacy(userId: string, legacy: AppState, current: AppState): Promise<ImportSummary> {
  const [qMap, aMap, pMap, cMap] = await Promise.all([clientMap('daily_questions'), clientMap('answers'), clientMap('phrases'), clientMap('chat_sessions')]);
  const sum: ImportSummary = { questions: 0, answers: 0, phrases: 0, chats: 0 };

  /** Decide the database id for a legacy item; returns [id, isNew]. */
  const resolve = (legacyId: string, existingIds: Set<string>, map: Map<string, string>): [string, boolean] => {
    if (existingIds.has(legacyId)) return [legacyId, false]; // already in the database (backup from the cloud version)
    const known = map.get(legacyId);
    if (known) return [known, false]; // imported before
    const id = isUuid(legacyId) ? legacyId : uid();
    map.set(legacyId, id);
    return [id, true];
  };

  // Profile, settings and topics: only fill what's still empty / default.
  if (!isBlankProfile(legacy.profile)) {
    // Fill only the fields that are still empty in the account.
    const merged = { ...current.profile };
    let changed = false;
    for (const k of Object.keys(DEFAULT_PROFILE) as (keyof Profile)[]) {
      const v = legacy.profile[k];
      if (v && (!merged[k] || (k === 'level' && merged[k] === DEFAULT_PROFILE.level))) { merged[k] = v; changed = changed || v !== current.profile[k]; }
    }
    if (changed) check(await supabase.from('profiles').upsert({ user_id: userId, ...merged }), 'Import profile');
  }
  if (!current.settings.onboarded) {
    check(await supabase.from('user_settings').upsert(settingsRow(userId, { ...current.settings, ...legacy.settings, onboarded: true })), 'Import settings');
    // Adopt the old active/inactive choices and custom topics.
    const merged: Topic[] = current.topics.map((t) => {
      const o = legacy.topics.find((x) => x.id === t.id);
      return o ? { ...t, active: o.active } : t;
    });
    legacy.topics.filter((t) => !merged.some((m) => m.id === t.id || m.name.toLowerCase() === t.name.toLowerCase())).forEach((t) => merged.push({ ...t, custom: true }));
    const r = check(await supabase.from('topics').upsert(topicRows(userId, merged), { onConflict: 'user_id,slug' }).select('id,slug'), 'Import topics');
    r.data?.forEach((t) => rememberTopic(t.slug, t.id));
  } else {
    const extra = legacy.topics.filter((t) => t.custom && !current.topics.some((m) => m.id === t.id || m.name.toLowerCase() === t.name.toLowerCase()));
    if (extra.length) {
      const rows = topicRows(userId, extra).map((r, i) => ({ ...r, sort_order: current.topics.length + i + 1 }));
      const r = check(await supabase.from('topics').upsert(rows, { onConflict: 'user_id,slug' }).select('id,slug'), 'Import topics');
      r.data?.forEach((t) => rememberTopic(t.slug, t.id));
    }
  }

  // Questions
  const qIds = new Set(current.questions.map((q) => q.id));
  const qResolved = new Map<string, string>();
  const qRows = [];
  for (const q of legacy.questions) {
    const [id, fresh] = resolve(q.id, qIds, qMap);
    qResolved.set(q.id, id);
    if (fresh) qRows.push(questionRow(userId, { ...q, id }, q.id));
  }
  for (const c of chunks(qRows)) check(await supabase.from('daily_questions').upsert(c, { onConflict: 'user_id,client_id', ignoreDuplicates: true }), 'Import questions');
  sum.questions = qRows.length;

  // Answers + fluency
  const aIds = new Set(current.entries.map((e) => e.id));
  const aRows = [];
  const fRows = [];
  for (const e of legacy.entries) {
    const [id, fresh] = resolve(e.id, aIds, aMap);
    if (!fresh) continue;
    aRows.push(answerRow(userId, { ...e, id }, qResolved.get(e.questionId) ?? null, e.id));
    if (e.fluency) fRows.push(fluencyRow(userId, id, 'answer', e.fluency, e.date));
    if (e.retry?.fluency) fRows.push(fluencyRow(userId, id, 'retry', e.retry.fluency, e.date));
  }
  for (const c of chunks(aRows)) check(await supabase.from('answers').upsert(c, { onConflict: 'user_id,client_id', ignoreDuplicates: true }), 'Import answers');
  for (const c of chunks(fRows)) check(await supabase.from('fluency_stats').upsert(c, { onConflict: 'answer_id,kind', ignoreDuplicates: true }), 'Import fluency');
  sum.answers = aRows.length;

  // Phrases + reviews (skip phrases already in the bank)
  const pIds = new Set(current.phrases.map((p) => p.id));
  const have = new Set(current.phrases.map((p) => phraseKey(p.phrase)));
  const pRows = [];
  const rRows = [];
  for (const p of legacy.phrases) {
    const key = phraseKey(p.phrase);
    if (!key) continue;
    const [id, fresh] = resolve(p.id, pIds, pMap);
    if (!fresh || have.has(key)) continue;
    have.add(key);
    pRows.push(phraseRow(userId, { ...p, id, reviews: p.reviews || [] }, p.id));
    rRows.push(...reviewRows(userId, id, p.reviews || []));
  }
  for (const c of chunks(pRows)) check(await supabase.from('phrases').upsert(c, { onConflict: 'user_id,client_id', ignoreDuplicates: true }), 'Import phrases');
  for (const c of chunks(rRows)) check(await supabase.from('phrase_reviews').insert(c), 'Import reviews');
  sum.phrases = pRows.length;

  // Chats + messages
  const cIds = new Set(current.chats.map((c) => c.id));
  const cRows = [];
  const mRows = [];
  for (const c of legacy.chats) {
    const [id, fresh] = resolve(c.id, cIds, cMap);
    if (!fresh) continue;
    cRows.push(chatRow(userId, { ...c, id }, c.id));
    mRows.push(...messageRows(userId, id, c.messages || []));
  }
  for (const c of chunks(cRows)) check(await supabase.from('chat_sessions').upsert(c, { onConflict: 'user_id,client_id', ignoreDuplicates: true }), 'Import chats');
  for (const c of chunks(mRows)) check(await supabase.from('chat_messages').upsert(c, { onConflict: 'session_id,position', ignoreDuplicates: true }), 'Import messages');
  sum.chats = cRows.length;

  // Daily activity: keep the larger value per day, so importing twice changes nothing.
  const days = new Set([...Object.keys(legacy.speakingLog), ...Object.keys(legacy.activityLog)]);
  const actRows = [...days].filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).map((d) => ({
    user_id: userId,
    activity_date: d,
    seconds_spoken: Math.max(num(current.speakingLog[d]), num(legacy.speakingLog[d])),
    practice_count: Math.max(num(current.activityLog[d]), Math.round(num(legacy.activityLog[d]))),
  }));
  for (const c of chunks(actRows)) check(await supabase.from('daily_activity').upsert(c, { onConflict: 'user_id,activity_date' }), 'Import activity');

  return sum;
}

// ---------------------------------------------------------------------------
// Delete all practice data (keeps the account)
// ---------------------------------------------------------------------------
export async function resetAll(userId: string): Promise<void> {
  // Children cascade: answers -> fluency_stats, phrases -> phrase_reviews, chat_sessions -> chat_messages.
  for (const t of ['shadowing_attempts', 'fluency_stats', 'answers', 'phrases', 'chat_sessions', 'daily_questions', 'daily_activity'] as const) {
    check(await supabase.from(t).delete().eq('user_id', userId), `Delete ${t}`);
  }
  check(await supabase.from('topics').delete().eq('user_id', userId).eq('is_custom', true), 'Delete custom topics');
  check(await supabase.from('topics').upsert(topicRows(userId, PRESET_TOPICS), { onConflict: 'user_id,slug' }), 'Reset topics');
  check(await supabase.from('profiles').upsert({ user_id: userId, ...DEFAULT_PROFILE }), 'Reset profile');
  check(await supabase.from('user_settings').upsert({ user_id: userId, onboarded: false }), 'Reset settings');
  // Recordings (best effort)
  try {
    const folder = `${userId}/shadowing`;
    const { data: days } = await supabase.storage.from('recordings').list(folder, { limit: 1000 });
    for (const d of days || []) {
      const { data: files } = await supabase.storage.from('recordings').list(`${folder}/${d.name}`, { limit: 1000 });
      const paths = (files || []).map((f) => `${folder}/${d.name}/${f.name}`);
      if (paths.length) await supabase.storage.from('recordings').remove(paths);
    }
  } catch { /* ignore */ }
}
