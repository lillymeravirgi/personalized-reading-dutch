// ── User ─────────────────────────────────────────────────────────────────────

export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export interface User {
  id: string;
  name: string;
  email: string;
  interests: string[];
  cefrLevel: CefrLevel;
  createdAt: string;
}

// ── Vocabulary ────────────────────────────────────────────────────────────────

export type WordStatus = "unknown" | "learning" | "learned";

export interface VocabularyWord {
  wordId: string;
  dutch: string;
  english: string;
  status: WordStatus;
  /** 0–1 */
  difficulty: number;
  exposureCount: number;
  lastSeen: string | null;
  /** 0–1 */
  reviewPriority: number;
}

// ── Reading session ───────────────────────────────────────────────────────────

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
  exampleSentences: string[];
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

// ── Flashcards ────────────────────────────────────────────────────────────────

export type ReviewInterval = "1d" | "2d" | "4d" | "1w" | "1m" | "never" | null;

export interface FlashcardItem {
  wordId: string;
  dutch: string;
  english: string;
  exampleSentence: string;
  difficulty: number;
  mode: "learning" | "review";
  nextReviewDate: string | null;
  reviewInterval: ReviewInterval;
}

// ── Interactions ──────────────────────────────────────────────────────────────

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

// ── Survey ────────────────────────────────────────────────────────────────────

export type LikertScale = 1 | 2 | 3 | 4 | 5;

export interface SurveyResponse {
  sessionId: string;
  focusedAttention: LikertScale;
  reward: LikertScale;
  perceivedRelevance: LikertScale;
}

// ── Assessment ────────────────────────────────────────────────────────────────

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

// ── API wrapper ───────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}
