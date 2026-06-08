export type CefrLevel = "A1" | "A2" | "B1" | "B2" | "C1" | "C2";

export const PURPOSES = ["work", "study", "integration", "travel", "other"] as const;
export type Purpose = (typeof PURPOSES)[number];

export interface User {
  id: string;
  user_id: string;
  email: string;
  name: string;
  display_name: string;
  interests: string[];
  cefrLevel: CefrLevel | null;
  assessedAt: string | null;
  createdAt: string | null;
  onboarding_completed: boolean;

  age?: number | null;
  city?: string | null;
  gender?: string | null;
  job?: string | null;
  academic_background?: string | null;
  mother_language?: string | null;
  other_languages?: string | null;
  purpose?: Purpose | null;

  has_switched_conditions?: boolean;
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

export interface LexiconEntry {
  word_id: number;
  word: string;
  translation: string;
  cefr_level: string;
  examples?: Array<BilingualSentence> | null;
  use_cases?: Array<BilingualSentence> | null;
}

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

export interface TextToken {
  text: string;
  type: "word" | "punctuation" | "space";
  status?: "new" | "learning" | "known" | null;
  wordId?: string | null;
}

export interface ReadingSession {
  sessionId: string;
  text: string;
  rawText: string;
  tokens: TextToken[];
  title: string;
  topic: string;
  cefrLevel: string;
  highlights: HighlightedWord[];
  readingNumber: number;
  surveyCompleted: boolean;
  wordTranslations: Record<string, string>;
}

export interface SessionSummary {
  session_id: number;
  user_id: string;
  title: string;
  topic_used: string | null;
  reading_number: number;
  study_phase: number;
  survey_completed: boolean;
  created_at?: string | null;
}

export interface ReadingProductivity {
  session_name: string;
  duration_min: number;
  date: string | null;
}

export interface DashboardStats {
  cefr_level: string;
  acquisition_score: number;
  total_known: number;
  total_learning: number;
  total_mastered: number;
  to_review: number;
  reviewed_today: number;
  daily_progress: number;
  readings_completed: number;
  readings_total: number;
  productivity_data?: ReadingProductivity[];
  avg_duration_min?: number;
  time_today_min: number;
  time_week_min: number;
  time_month_min: number;
  is_new: boolean;
}

export type ReviewInterval = "today" | "1d" | "2d" | "4d" | "1w" | "1m" | "never" | null;

export interface FlashcardItem {
  wordId: string;
  dutch: string;
  english: string;
  examples: BilingualSentence[];
  exampleSentence: BilingualSentence;
  difficulty: number;
  mode: "learning" | "review";
  nextReviewDate: string | null;
  reviewInterval: ReviewInterval;
}

export type InteractionAction = "DEEP_PROCESSING" | "ACQUISITION_INTENT" | "WORD_AVOIDANCE";
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
  duration_seconds?: number;
}

export interface VocabTestQuestion {
  questionId: string;
  wordId: string;
  dutch: string;
  prompt: string;
  options: string[];
  correctIndex: number;
}

export interface VocabTestAnswer {
  word_id: string;
  chosen_answer: string;
  is_correct: boolean;
}

export interface VocabTestResult {
  sessionGroupId: number;
  answers: VocabTestAnswer[];
  correct: number;
  total: number;
}

export interface AssessmentWord {
  wordId: string;
  dutch: string;
  english?: string;
  isPseudo?: boolean;
}

export interface AssessmentBatchData {
  batchNumber: number;
  totalBatches: number;
  words: AssessmentWord[];
}

export type AssessmentBatch = AssessmentBatchData;

export interface AssessmentResult {
  knownWordIds: string[];
  unknownWordIds: string[];
  estimatedLevel: string;
  confidenceScore: number;
}

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };
