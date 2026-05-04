export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export interface User {
  id: string;
  name: string;
  email: string;
  interests: string[];
  cefrLevel: CefrLevel | null;
  assessedAt: string | null;
  createdAt: string;
}

export interface BilingualSentence {
  nl: string;
  en: string;
}

export type WordStatus = "unknown" | "learning" | "learned";

export interface VocabularyWord {
  wordId: string;
  dutch: string;
  english: string;
  status: WordStatus;
  difficulty: number;
  exposureCount: number;
  lastSeen: string | null;
  reviewPriority: number;
}

export type HighlightType = "unknown" | "learning";
export type UsageFrequency = "common" | "moderate" | "rare";

export interface HighlightedWord {
  wordId: string;
  dutch: string;
  english: string;
  startIndex: number;
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
  isAdaptive: boolean;
}

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

export type InteractionAction = "see_examples" | "add_to_learn" | "ignore";
export type InteractionWeight = 5 | 2 | 1;

export interface WordInteraction {
  wordId: string;
  sessionId: string;
  action: InteractionAction;
  weight: InteractionWeight;
  timestamp: string;
}

export type LikertScale = 1 | 2 | 3 | 4 | 5;
export type TLXScale = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface SurveyResponse {
  sessionId: string;
  worthMyTime: LikertScale;
  appropriateChallenge: LikertScale;
  comprehension: LikertScale;
  focusedAttention: LikertScale;
  reward: LikertScale;
  perceivedRelevance: LikertScale;
  mentalEffort: TLXScale;
  perceivedPersonalization: LikertScale;
}

export type VocabTestPhase = "IMMEDIATE" | "DELAYED_24H";

export interface VocabTestQuestion {
  questionId: string;
  wordId: string;
  dutch: string;
  prompt: string;
  options: string[];
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

export interface AssessmentWord {
  wordId: string;
  dutch: string;
  english?: string;
  isPseudo?: boolean;
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

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };
