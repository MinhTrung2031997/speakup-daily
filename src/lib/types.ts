export interface Profile {
  name: string;
  job: string;
  city: string;
  hobbies: string;
  goals: string;
  level: string;
  facts: string;
}

export interface Topic {
  id: string;
  name: string;
  emoji: string;
  active: boolean;
  custom?: boolean;
}

export interface Settings {
  model: string;
  dark: boolean;
  voiceURI: string;
  rate: number;
  onboarded: boolean;
  fastMode: boolean;
  /** Demo mode (sample AI answers). Saved per device, not in the database. */
  demo: boolean;
}

export interface DailyQuestion {
  id: string;
  date: string; // YYYY-MM-DD (local)
  topicId: string;
  topicName: string;
  question: string;
  starters: string[];
  /** Suggested answer versions, oldest first, max 5 (daily_questions.suggested = {...latest, versions}). */
  suggestions?: SuggestedAnswer[];
  createdAt: number;
}

export interface PhraseItem {
  phrase: string;
  meaning: string;
  example: string;
}

export interface Correction {
  original: string;
  better: string;
  why: string;
}

export interface Upgrade {
  natural: string;
  structure: { point: string; reason: string; example: string; wrapUp: string };
  phrases: PhraseItem[];
  corrections: Correction[];
  encouragement: string;
}

export interface FluencyStats {
  words: number;
  seconds: number; // speaking time used for WPM
  wpm: number;
  fillers: number;
  fillerWords: Record<string, number>; // filler -> count
  restarts: number;
  restartExamples: string[];
  pauses: number; // gaps > 2s between recognised phrases
  longestPause: number; // seconds
  /** 'audio' when fillers/pauses were counted by Gemini from the recording (else Chrome's transcript timing). */
  source?: 'audio' | 'transcript';
  tip: string;
  createdAt: number;
}

export interface RetryResult {
  attempt: string;
  used: string[];
  missed: string[];
  score: number; // 0-100
  tip: string;
  praise: string;
  fluency?: FluencyStats;
  pronunciation?: PronunciationResult;
}

export interface Entry {
  id: string;
  date: string;
  questionId: string;
  question: string;
  topicName: string;
  answer: string;
  upgrade?: Upgrade;
  retry?: RetryResult;
  /** Fluency stats from speaking the original answer (only when the mic was used). */
  fluency?: FluencyStats;
  /** Set when this entry came from the Answer builder (answer = the learner's "say it your way" try). */
  builder?: BuilderInfo;
  /** Pronunciation check of the spoken answer (builder: of the "say it your way" try). */
  pronunciation?: PronunciationResult;
  createdAt: number;
}

export type QuestionType = 'Opinion' | 'Experience' | 'Compare' | 'Describe' | 'Hypothetical' | 'Small talk';
export type BuilderLevel = 'Simple' | 'Natural' | 'Fluent';
export type BuilderLength = 20 | 45 | 90 | 120;

export interface BuilderPart {
  slot: string;
  text: string;
}

/** Answer builder data saved with an Entry (answers.builder jsonb). */
export interface BuilderInfo {
  qtype: QuestionType;
  slots: string[];
  /** slot -> chosen or typed idea */
  picks: Record<string, string>;
  level: BuilderLevel;
  seconds: BuilderLength;
  /** The model answer split into its labelled parts. */
  parts: BuilderPart[];
  /** 'auto' = the AI chose the ideas (shown as labels), 'starters' = built from the daily idea starters. */
  source?: 'picked' | 'auto' | 'starters';
}

/** A suggested model answer for a daily question (daily_questions.suggested jsonb, cached). */
export interface SuggestedAnswer {
  /** Version id (older single suggestions get one on load). */
  id: string;
  /** Stance asked for ("➕ Another angle" rotates agree / disagree / it depends). */
  stance?: string;
  qtype: QuestionType;
  slots: string[];
  /** slot -> idea used */
  ideas: Record<string, string>;
  level: BuilderLevel;
  seconds: BuilderLength;
  answer: string;
  parts: BuilderPart[];
  phrases: PhraseItem[];
  createdAt: number;
}

export interface ReviewLog {
  date: string;
  sentence: string;
  ok: boolean;
  feedback: string;
}

export interface Phrase extends PhraseItem {
  id: string;
  source: string; // question it came from
  createdAt: number;
  addedDate: string;
  stage: number; // 0..5 (5 = mastered)
  due: string; // YYYY-MM-DD
  reviews: ReviewLog[];
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  nudge?: string;
}

export interface ChatFeedback {
  summary: string;
  goodPoints: string[];
  improve: string[];
  phrasesUsed: string[];
}

export interface ChatSession {
  id: string;
  date: string;
  topicName: string;
  question: string;
  messages: ChatMessage[];
  feedback?: ChatFeedback;
  createdAt: number;
}

export interface AppState {
  version: 1;
  profile: Profile;
  topics: Topic[];
  settings: Settings;
  questions: DailyQuestion[];
  entries: Entry[];
  phrases: Phrase[];
  chats: ChatSession[];
  listens: ListenSession[];
  sounds: SoundItem[];
  /** Pronunciation scores of shadowing takes (read-only, for Progress). */
  shadowPron: { id: string; score: number; createdAt: number }[];
  speakingLog: Record<string, number>; // date -> seconds spoken
  activityLog: Record<string, number>; // date -> count of practice actions
}

/** One shadowing take, saved to the shadowing_attempts table (recording optional). */
export interface ShadowAttemptInput {
  sourceText: string;
  sentenceIndex: number;
  sentence: string;
  transcript: string;
  score: number | null;
  seconds: number;
  /** Object URL of the recorded audio; uploaded to the private `recordings` bucket if present. */
  audioUrl?: string;
  /** Row id (so a later pronunciation check can be attached to the same row). */
  id?: string;
}

// ---------- Listen tab ----------
export type Accent = 'US' | 'UK';

export interface ListenLine {
  speaker: 'Alex' | 'Sam';
  text: string;
}

export interface ListenQuestion {
  q: string;
  options: string[];
  /** Index of the correct option (0-3). */
  answer: number;
}

export interface ListenDrill {
  title: string;
  lines: ListenLine[];
  questions: ListenQuestion[];
  dictation: string;
  keyIdeas: string[];
  phrases: PhraseItem[];
}

export interface RetellResult {
  retell: string;
  ideasCovered: string[];
  ideasMissed: string[];
  phrasesUsed: string[];
  score: number; // 0-100
  tip: string;
  praise: string;
  modelRetell: string;
  fluency?: FluencyStats;
}

/** One listening drill, saved to the listening_sessions table. */
export interface ListenSession {
  id: string;
  date: string;
  topic: string;
  accent: Accent;
  speed: number;
  level: BuilderLevel;
  drill: ListenDrill;
  /** Chosen option per question (-1 = not answered). */
  answers?: number[];
  questionScore?: number; // 0-3
  dictationText?: string;
  dictationAccuracy?: number; // 0-100
  retell?: RetellResult;
  /** Pronunciation check of the retell. */
  pronunciation?: PronunciationResult;
  createdAt: number;
}

// ---------- Pronunciation (audio check) ----------
export interface PronWord {
  /** Target word as it should be said. */
  word: string;
  /** Roughly what the learner said, e.g. "wor" for "work" ('' if unclear). */
  heard: string;
  /** final-consonant | th | s-sh | stress | vowel | other */
  issue: string;
  /** One short coaching tip, e.g. "stress the 2nd syllable: de-VEL-op". */
  tip: string;
  ipa?: string;
}

export interface PronunciationResult {
  score: number; // 0-100
  /** What Gemini heard, word for word, including fillers. */
  transcript: string;
  clarity: string;
  intonation: string;
  pace: string;
  wpm?: number;
  fillers: Record<string, number>;
  fillerTotal: number;
  longPauses: number; // > 1.5s
  longestPause?: number;
  words: PronWord[];
  rhythmTip: string;
  wellDone: string;
  /** Seconds of audio that were checked. */
  seconds: number;
  createdAt: number;
}

/** A problem word saved to "Sounds to fix" (pronunciation_items), reviewed with the phrase SRS. */
export interface SoundItem {
  id: string;
  word: string;
  note: string;
  ipa: string;
  issue: string;
  heard: string;
  timesSeen: number;
  lastSeen: string;
  stage: number;
  due: string;
  createdAt: number;
}
