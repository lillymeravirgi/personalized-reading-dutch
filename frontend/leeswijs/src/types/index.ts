// User
export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export interface User {
  id: string;
  name: string;
  email: string;
  interests: string[];
  /** null = assessment not yet completed */
  cefrLevel: CefrLevel | null;
  /** ISO timestamp of the most recent assessment completion, null if never. */
  assessedAt: string | null;
  createdAt: string;
}

/** Bilingual example sentence: Dutch text + English translation.
 *  Matches backend lexicon shape (backend/seed.py -> Lexicon.examples). */
export interface BilingualSentence {
  nl: string;
  en: string;
}

// Vocabulary
export type WordStatus = "unknown" | "learning" | "learned";

export interface VocabularyWord {
  wordId: string;
  dutch: string;
  english: string;
  status: WordStatus;
  /** 0-1 */
  difficulty: number;
  exposureCount: number;
  lastSeen: string | null;
  /** 0-1 */
  reviewPriority: number;
}

// Reading session
export type HighlightType = "unknown" | "learning";
export type UsageFrequency = "common" | "moderate" | "rare";

export interface HighlightedWord {
  wordId: string;
  dutch: string;
  english: string;
  /** Character index in ReadingSession.text (inclusive) */
  startIndex: number;
  /** Character index in ReadingSession.text (exclusive) */
  endIndex: number;
  highlightType: HighlightType;
  exampleSentences: BilingualSentence[];
  usageFrequency: UsageFrequency;
}

export interface ReadingSession {
  sessionId: string;
  text: string;
  title: string;
  topic: string;
  cefrLevel: string;
  highlights: HighlightedWord[];
  /** true = personalised, false = baseline */
  isAdaptive: boolean;
}

// Flashcards
export type ReviewInterval = "1d" | "2d" | "4d" | "1w" | "1m" | "never" | null;

export interface FlashcardItem {
  wordId: string;
  dutch: string;
  english: string;
  exampleSentence: BilingualSentence;
  difficulty: number;
  mode: "learning" | "review";
  nextReviewDate: string | null;
  reviewInterval: ReviewInterval;
}

// Interactions
export type InteractionAction = "see_examples" | "add_to_learn" | "ignore";
export type InteractionWeight = 5 | 2 | 1;

export interface WordInteraction {
  wordId: string;
  sessionId: string;
  action: InteractionAction;
  /** 5 = see_examples, 2 = add_to_learn, 1 = ignore */
  weight: InteractionWeight;
  timestamp: string;
}

// Survey
export type LikertScale = 1 | 2 | 3 | 4 | 5;
/** NASA-TLX mental-effort item (Hart & Staveland, 1988) - 7-point scale. */
export type TLXScale = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface SurveyResponse {
  sessionId: string;
  /** RQ1-W3: "The reading felt worth my time and effort." */
  worthMyTime: LikertScale;
  /** ZPD-1: "The text was appropriately challenging for my level." */
  appropriateChallenge: LikertScale;
  /** COMP-1: "I could follow the main ideas of the text without difficulty." */
  comprehension: LikertScale;
  /** UES-FA: "I was so involved in this text that I lost track of time." */
  focusedAttention: LikertScale;
  /** UES-RW: "I would want to read more texts similar to this one." */
  reward: LikertScale;
  /** UES-PR: "The content of this text felt personally meaningful to me." */
  perceivedRelevance: LikertScale;
  /** TLX-MD: "How much mental effort did it take to read this text?" (1–7) */
  mentalEffort: TLXScale;
  /** MC-1: "This text felt specifically tailored to my interests and Dutch level." */
  perceivedPersonalization: LikertScale;
}

// Vocabulary test
export type VocabTestPhase = "IMMEDIATE" | "DELAYED_24H";

export interface VocabTestQuestion {
  questionId: string;
  wordId: string;
  dutch: string;
  prompt: string;
  options: string[];
  /** Mock/frontend contract uses this for scoring. Backend can also score. */
  correctIndex: number;
}

export interface VocabTest {
  sessionId: string;
  phase: VocabTestPhase;
  questions: VocabTestQuestion[];
}

export interface VocabTestAnswer {
  questionId: string;
  wordId: string;
  selectedIndex: number;
  isCorrect: boolean;
}

export interface VocabTestResult {
  sessionId: string;
  phase: VocabTestPhase;
  answers: VocabTestAnswer[];
  correct: number;
  total: number;
  submittedAt: string;
}

// Assessment
export interface AssessmentWord {
  wordId: string;
  dutch: string;
  english: string;
}

export interface AssessmentBatch {
  batchNumber: number;
  words: AssessmentWord[];
  totalBatches: number;
}

export interface AssessmentResult {
  knownWordIds: string[];
  unknownWordIds: string[];
  estimatedLevel: string;
  confidenceScore: number;
}

// Generic API response wrapper
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };