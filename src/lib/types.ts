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
  apiKey: string;
  model: string;
  dark: boolean;
  voiceURI: string;
  rate: number;
  onboarded: boolean;
  fastMode: boolean;
}

export interface DailyQuestion {
  id: string;
  date: string; // YYYY-MM-DD (local)
  topicId: string;
  topicName: string;
  question: string;
  starters: string[];
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

export interface RetryResult {
  attempt: string;
  used: string[];
  missed: string[];
  score: number; // 0-100
  tip: string;
  praise: string;
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
  speakingLog: Record<string, number>; // date -> seconds spoken
  activityLog: Record<string, number>; // date -> count of practice actions
}
