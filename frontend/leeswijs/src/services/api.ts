/**
 * api.ts — All backend communication for Leeswijs.
 * No mock data. All calls go to the real FastAPI backend.
 */
import axios, { AxiosError } from "axios";
import type {
  ApiResponse,
  AssessmentBatchData,
  LexiconEntry,
  ReadingSession,
  SessionSummary,
  SurveyResponse,
  User,
  VocabTestAnswer,
  VocabTestQuestion,
} from "../types";

// ── Axios client ──────────────────────────────────────────────────────────────

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:8000/api";

export const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

const READING_GENERATION_TIMEOUT_MS = 120_000;

apiClient.interceptors.request.use((config) => {
  const raw = localStorage.getItem("leeswijs-store");
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as { state?: { user?: { id?: string } } };
      const uid = parsed?.state?.user?.id;
      if (uid) config.headers["X-User-Id"] = uid;
    } catch {
      /* ignore */
    }
  }
  return config;
});

function extractError(err: unknown): string {
  if (err instanceof AxiosError) {
    if (err.code === "ECONNABORTED" || err.message.toLowerCase().includes("timeout")) {
      return "This is taking longer than expected. Please wait a moment and try again.";
    }
    const detail = err.response?.data?.detail;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((d) => d.msg ?? d).join("; ");
    return err.message;
  }
  return err instanceof Error ? err.message : "An unexpected error occurred.";
}

// ─────────────────────────────────────────────────────────────────────────────
//  Auth
// ─────────────────────────────────────────────────────────────────────────────

interface BackendAuthResponse {
  user_id: string;
  email: string;
  display_name?: string;
  estimated_cefr?: string;
  onboarding_completed: boolean;
  current_condition?: string;
  has_switched_conditions?: boolean;
}

interface BackendAssessmentWord {
  word_id: string | number;
  dutch: string;
  english?: string;
  is_pseudo?: boolean;
}

interface BackendAssessmentBatch {
  batch_number?: number;
  total_batches?: number;
  words?: BackendAssessmentWord[];
}

interface BackendTextToken {
  text: string;
  type: "word" | "punctuation" | "space";
  status?: "new" | "learning" | "known" | null;
  word_id?: string | number | null;
}

function mapAuthResponseToUser(data: BackendAuthResponse): User {
  return {
    id:                       data.user_id,
    user_id:                  data.user_id,
    email:                    data.email,
    name:                     data.display_name || data.email.split("@")[0],
    display_name:             data.display_name || "",
    interests:                [],
    cefrLevel:                (data.estimated_cefr as User["cefrLevel"]) ?? null,
    assessedAt:               null,
    createdAt:                new Date().toISOString(),
    onboarding_completed:     data.onboarding_completed,
    preferred_styles:         [],
    current_condition:        data.current_condition ?? "ADAPTIVE",
    has_switched_conditions:  data.has_switched_conditions ?? false,
  };
}

/** Create a new account (Study ID + password).
 *  startCondition is set by the researcher via ?start=ADAPTIVE|BASELINE in the URL.
 */
export async function registerUser(
  studyId: string,
  password: string,
  startCondition?: string,
): Promise<User> {
  try {
    const { data } = await apiClient.post<BackendAuthResponse>("/auth/register", {
      email: studyId,
      password,
      study_code: studyId,
      ...(startCondition ? { start_condition: startCondition } : {}),
    });
    return mapAuthResponseToUser(data);
  } catch (err) {
    throw new Error(extractError(err));
  }
}

/** Log in with Study ID + password. */
export async function login(studyId: string, password: string): Promise<User> {
  try {
    const { data } = await apiClient.post<BackendAuthResponse>("/auth/login", {
      email: studyId,
      password,
    });
    return mapAuthResponseToUser(data);
  } catch (err) {
    throw new Error(extractError(err));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  User / Profile
// ─────────────────────────────────────────────────────────────────────────────

/** Fetch the current user's full profile from the backend. */
export async function fetchMe(userId: string): Promise<User> {
  try {
    const { data } = await apiClient.get<{ success: boolean; data: Record<string, unknown> }>(
      "/users/me",
      { headers: { "X-User-Id": userId } },
    );
    const d = data.data;
    return {
      id:                   String(d.id ?? d.user_id ?? ""),
      user_id:              String(d.user_id ?? ""),
      email:                String(d.email ?? ""),
      name:                 String(d.display_name || d.name || ""),
      display_name:         String(d.display_name ?? ""),
      interests:            Array.isArray(d.interests) ? (d.interests as string[]) : [],
      cefrLevel:            (d.cefrLevel as User["cefrLevel"]) ?? null,
      assessedAt:           null,
      createdAt:            String(d.createdAt ?? ""),
      onboarding_completed: Boolean(d.onboarding_completed),
      age:                  typeof d.age === "number" ? d.age : null,
      city:                 typeof d.city === "string" ? d.city : null,
      gender:               typeof d.gender === "string" ? d.gender : null,
      job:                  typeof d.job === "string" ? d.job : null,
      academic_background:  typeof d.academic_background === "string" ? d.academic_background : null,
      mother_language:      typeof d.mother_language === "string" ? d.mother_language : null,
      other_languages:      typeof d.other_languages === "string" ? d.other_languages : null,
      purpose:              typeof d.purpose === "string" ? (d.purpose as User["purpose"]) : null,
      preferred_styles:     Array.isArray(d.preferred_styles) ? (d.preferred_styles as User["preferred_styles"]) : [],
    };
  } catch (err) {
    throw new Error(extractError(err));
  }
}

/** Save full profile update (all editable fields). */
export async function saveProfile(user: Partial<User> & { id: string }): Promise<void> {
  try {
    await apiClient.put(
      "/users/me/profile",
      {
        display_name:        user.display_name,
        age:                 user.age,
        city:                user.city,
        gender:              user.gender,
        job:                 user.job,
        academic_background: user.academic_background,
        mother_language:     user.mother_language,
        other_languages:     user.other_languages,
        purpose:             user.purpose,
        preferred_styles:    user.preferred_styles,
        interests:           user.interests,
        estimated_cefr:      user.cefrLevel,
      },
      { headers: { "X-User-Id": user.id } },
    );
  } catch (err) {
    throw new Error(extractError(err));
  }
}

/** Mark onboarding as completed. */
export async function completeOnboarding(userId: string): Promise<void> {
  try {
    await apiClient.post(
      "/users/me/complete-onboarding",
      {},
      { headers: { "X-User-Id": userId } },
    );
  } catch (err) {
    throw new Error(extractError(err));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Onboarding
// ─────────────────────────────────────────────────────────────────────────────

/** Save Step 1 personal info. */
export async function savePersonalInfo(
  userId: string,
  info: {
    display_name?: string;
    age?: number;
    city?: string;
    gender?: string;
    job?: string;
    academic_background?: string;
    mother_language?: string;
    other_languages?: string;
    purpose?: string;
    preferred_styles?: string[];
    self_reported_cefr?: string;
  },
): Promise<void> {
  try {
    await apiClient.post("/onboarding/personal-info", { user_id: userId, ...info });
  } catch (err) {
    throw new Error(extractError(err));
  }
}

/** Select the flashcard words for a reading block. */
export async function selectOnboardingWords(
  userId: string,
  isRefill: boolean = false,
  studyPhase: number = 1,
): Promise<LexiconEntry[]> {
  try {
    const { data } = await apiClient.post<{ words: LexiconEntry[] }>(
      `/onboarding/words/${userId}?is_refill=${isRefill}&study_phase=${studyPhase}`,
    );
    return data.words ?? [];
  } catch (err) {
    throw new Error(extractError(err));
  }
}

/** Get the stored flashcard words for a reading block. */
export async function getOnboardingWords(
  userId: string,
  studyPhase: number = 1,
): Promise<LexiconEntry[]> {
  try {
    const { data } = await apiClient.get<{ words: LexiconEntry[] }>(
      `/onboarding/words/${userId}`,
      { params: { study_phase: studyPhase } },
    );
    return data.words ?? [];
  } catch (err) {
    throw new Error(extractError(err));
  }
}

export interface OnboardingWordSetStatus {
  study_phase: number;
  target_count: number;
  selected_count: number;
  learning_count: number;
  ready: boolean;
}

export async function getOnboardingWordSetStatus(
  userId: string,
  studyPhase: number = 1,
): Promise<OnboardingWordSetStatus> {
  try {
    const { data } = await apiClient.get<OnboardingWordSetStatus>(
      `/onboarding/words/${userId}/status`,
      { params: { study_phase: studyPhase } },
    );
    return data;
  } catch (err) {
    throw new Error(extractError(err));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Assessment
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a vocabulary batch via Gemini.
 * batchNumber: 1, 2, or 3.
 * selfReportedCefr: from Step 1 dropdown.
 * knownWords / allWords: provided for batches 2 & 3 to target the boundary.
 */
export async function getAssessmentBatch(
  batchNumber: number,
  userId: string,
  selfReportedCefr: string,
  knownWords?: string[],
  allWords?: string[],
): Promise<ApiResponse<AssessmentBatchData>> {
  try {
    const { data } = await apiClient.post<BackendAssessmentBatch>(
      "/assessment/batch/generate",
      {
        user_id:           userId,
        batch_number:      batchNumber,
        self_reported_cefr: selfReportedCefr,
        known_words:       knownWords ?? [],
        all_words:         allWords ?? [],
      },
    );
    return {
      success: true,
      data: {
        batchNumber:  Number(data.batch_number ?? batchNumber),
        totalBatches: Number(data.total_batches ?? 1),
        words:        (data.words || []).map((w) => ({
          wordId:   String(w.word_id),
          dutch:    String(w.dutch),
          english:  typeof w.english === "string" ? w.english : undefined,
          isPseudo: Boolean(w.is_pseudo),
        })),
      },
    };
  } catch (err) {
    return { success: false, error: extractError(err) };
  }
}

/** Submit the final assessment result. */
export async function submitAssessment(
  userId: string,
  batchNumber: number,
  knownWordIds: string[],
  allWordIds: string[],
  estimatedLevel: string,
  confidenceScore: number,
  isFinal: boolean,
): Promise<void> {
  try {
    await apiClient.post("/assessment/submit", {
      user_id:        userId,
      batch_number:   batchNumber,
      known_word_ids: knownWordIds,
      all_word_ids:   allWordIds,
      estimated_level: estimatedLevel,
      confidence_score: confidenceScore,
      is_final:       isFinal,
    });
  } catch (err) {
    throw new Error(extractError(err));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Reading sessions
// ─────────────────────────────────────────────────────────────────────────────

export type ConditionType = "ADAPTIVE" | "BASELINE";

/** Returns "ADAPTIVE" for odd sessions, "BASELINE" for even (counterbalancing). */
export function getCondition(sessionNumber?: number): ConditionType {
  if (sessionNumber === undefined) return "ADAPTIVE";
  return sessionNumber % 2 === 1 ? "ADAPTIVE" : "BASELINE";
}

function mapSessionResponse(data: Record<string, unknown>): ReadingSession {
  const content = String(data.content ?? "");
  const rawBlue   = (data.blue_words   as Array<Record<string, unknown>>) ?? [];
  const rawYellow = (data.yellow_words as Array<Record<string, unknown>>) ?? [];
  const wordTranslations = (data.word_translations as Record<string, string>) ?? {};

  function buildHighlights(
    rows: Array<Record<string, unknown>>,
    type: "unknown" | "learning",
  ) {
    const out: ReadingSession["highlights"] = [];
    for (const row of rows) {
      const word = String(row.word ?? "");
      const rx = new RegExp(`\\[\\[${word}\\]\\]`, "gi");
      let m: RegExpExecArray | null;
      while ((m = rx.exec(content)) !== null) {
        out.push({
          wordId:        String(row.word_id ?? ""),
          dutch:         word,
          english:       String(row.translation ?? ""),
          startIndex:    m.index,
          endIndex:      m.index + m[0].length,
          highlightType: type,
          exampleSentences: Array.isArray(row.examples)
            ? (row.examples as Array<{ nl: string; en: string }>)
            : [],
          usageFrequency: "common",
        });
      }
    }
    return out;
  }

  return {
    sessionId:        String(data.session_id ?? ""),
    title:            String(data.title ?? ""),
    text:             content.replace(/\[\[([^\]]+)\]\]/g, "$1"),
    tokens:           ((data.tokens ?? []) as BackendTextToken[]).map(t => ({
      text:   String(t.text),
      type:   t.type,
      status: t.status,
      wordId: t.word_id ? String(t.word_id) : null,
    })),
    topic:            String(data.topic_used ?? ""),
    cefrLevel:        "B1",
    highlights:       [
      ...buildHighlights(rawBlue,   "unknown"),
      ...buildHighlights(rawYellow, "learning"),
    ],
    isAdaptive:       String(data.condition) === "ADAPTIVE",
    readingNumber:    Number(data.reading_number ?? 1),
    surveyCompleted:  Boolean(data.survey_completed),
    wordTranslations,
  };
}

/** Generate a new reading session. */
export async function generateSession(
  userId: string,
  condition: ConditionType,
): Promise<{ sessionId: string; readingNumber: number }> {
  try {
    const { data } = await apiClient.post<Record<string, unknown>>(
      "/session/generate",
      {
        user_id:   userId,
        condition,
      },
      { timeout: READING_GENERATION_TIMEOUT_MS },
    );
    return {
      sessionId:     String(data.session_id),
      readingNumber: Number(data.reading_number ?? 1),
    };
  } catch (err) {
    throw new Error(extractError(err));
  }
}

/** Fetch a full reading session by ID. */
export async function getReadingSession(
  sessionId: string,
  userId?: string,
): Promise<ApiResponse<ReadingSession>> {
  try {
    const { data } = await apiClient.get<Record<string, unknown>>(
      `/session/${sessionId}`,
      { params: { user_id: userId } },
    );
    return { success: true, data: mapSessionResponse(data) };
  } catch (err) {
    return { success: false, error: extractError(err) };
  }
}

/** List reading sessions for a user, optionally filtered by study_phase. */
export async function listSessions(
  userId: string,
  studyPhase?: number,
): Promise<SessionSummary[]> {
  try {
    const params: Record<string, string | number> = { user_id: userId };
    if (studyPhase !== undefined) params.study_phase = studyPhase;
    const { data } = await apiClient.get<SessionSummary[]>("/session/list", { params });
    return data;
  } catch {
    return [];
  }
}

/** Continue a reading session (extend same topic). */
export async function continueSession(
  userId: string,
  previousSessionId: string,
): Promise<ReadingSession> {
  const { data } = await apiClient.post<Record<string, unknown>>(
    "/session/continue",
    {
      user_id:             userId,
      previous_session_id: previousSessionId,
    },
    { timeout: READING_GENERATION_TIMEOUT_MS },
  );
  return mapSessionResponse(data);
}

// ─────────────────────────────────────────────────────────────────────────────
//  Vocabulary
// ─────────────────────────────────────────────────────────────────────────────

/** Define an unknown word (looks up lexicon or calls Gemini). */
export async function defineWord(word: string): Promise<LexiconEntry | null> {
  try {
    const { data } = await apiClient.get<LexiconEntry>(
      `/lexicon/define/${encodeURIComponent(word)}`,
    );
    return data;
  } catch {
    return null;
  }
}

/** Add a word to the user's learning list. */
export async function addToLearnList(
  userId: string,
  wordId: number,
  reviewIntervalDays?: number,
): Promise<void> {
  await apiClient.patch("/vocab/add-to-learn", {
    user_id:               userId,
    word_id:               wordId,
    review_interval_days:  reviewIntervalDays,
  });
}

export async function markKnown(
  userId: string,
  wordId: number,
): Promise<void> {
  await apiClient.patch("/vocab/mark-known", {
    user_id: userId,
    word_id: wordId,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  Survey
// ─────────────────────────────────────────────────────────────────────────────

export async function submitSurvey(
  payload: SurveyResponse,
): Promise<ApiResponse<{ signal: Record<string, unknown> }>> {
  try {
    const { data } = await apiClient.post<{ success: boolean; signal: Record<string, unknown> }>(
      "/surveys",
      {
        sessionId:                String(payload.sessionId),
        worthMyTime:              payload.worthMyTime,
        appropriateChallenge:     payload.appropriateChallenge,
        comprehension:            payload.comprehension,
        focusedAttention:         payload.focusedAttention,
        reward:                   payload.reward,
        perceivedRelevance:       payload.perceivedRelevance,
        mentalEffort:             payload.mentalEffort,
        perceivedPersonalization: payload.perceivedPersonalization,
      },
    );
    return { success: true, data: { signal: data.signal } };
  } catch (err) {
    return { success: false, error: extractError(err) };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Flashcards
// ─────────────────────────────────────────────────────────────────────────────

import type { FlashcardItem } from "../types";

export interface FlashcardsResponse {
  cards: FlashcardItem[];
  due_count: number;
  not_due_count: number;
  reviewed_today: number;
  total: number;
}

export interface DiscoverCard {
  wordId: string;
  dutch: string;
  english: string;
  examples: { nl: string; en: string }[];
  cefrLevel?: string;
}

function normalizeCard(card: FlashcardItem): FlashcardItem {
  const examples = card.examples ?? [];
  return {
    ...card,
    examples,
    exampleSentence: examples[0] ?? { nl: card.dutch, en: card.english },
  };
}

export async function getFlashcards(
  _sessionId?: string | null,
  userId?: string | null,
): Promise<ApiResponse<FlashcardsResponse>> {
  if (!userId) return { success: false, error: "No user" };
  try {
    const { data } = await apiClient.get<FlashcardsResponse>("/flashcards", {
      params: { user_id: userId },
    });
    return {
      success: true,
      data: {
        ...data,
        cards: (data.cards ?? []).map(normalizeCard),
      },
    };
  } catch (err) {
    return { success: false, error: extractError(err) };
  }
}

/** Fetch pre-buffered KRS recommendations (non-blocking, uses existing DB buffer). */
export async function discoverPrefetch(
  userId: string,
): Promise<{ words: DiscoverCard[]; remaining: number }> {
  try {
    const { data } = await apiClient.get<{ words: DiscoverCard[]; remaining: number }>(
      "/flashcards/discover-prefetch",
      { params: { user_id: userId } },
    );
    return { words: data.words ?? [], remaining: data.remaining ?? data.words?.length ?? 0 };
  } catch {
    return { words: [], remaining: 0 };
  }
}

export async function submitFlashcardReview(
  userId: string,
  wordId: string,
  remembered: boolean,
  intervalDays?: number,
): Promise<void> {
  await apiClient.post("/flashcards/review", {
    user_id:       userId,
    word_id:       parseInt(wordId, 10),
    remembered,
    interval_days: intervalDays ?? null,
  });
}

export async function markKnownFlashcard(
  userId: string,
  wordId: string,
): Promise<void> {
  await apiClient.post("/flashcards/mark-known", {
    user_id: userId,
    word_id: parseInt(wordId, 10),
  });
}

/** Add a discovered word to the user's LEARNING list with an initial SRS interval. */
export async function addDiscoveredToLearn(
  userId: string,
  wordId: string,
  intervalDays = 1,
): Promise<void> {
  await apiClient.post("/flashcards/add-to-learn", {
    user_id:       userId,
    word_id:       parseInt(wordId, 10),
    interval_days: intervalDays,
  });
}

export async function discoverNewWords(
  userId: string,
): Promise<LexiconEntry[]> {
  try {
    const { data } = await apiClient.post<{ words: LexiconEntry[] }>(
      "/flashcards/discover",
      { user_id: userId },
    );
    return data.words ?? [];
  } catch (err) {
    throw new Error(extractError(err));
  }
}


// ─────────────────────────────────────────────────────────────────────────────
//  Vocabulary Test
// ─────────────────────────────────────────────────────────────────────────────

/** Start the vocab test from the user's onboarding words for the given study phase. */
export async function startVocabTest(
  userId: string,
  sessionGroupId: number,
  studyPhase: number = 1,
): Promise<ApiResponse<{ questions: VocabTestQuestion[]; sessionGroupId: number }>> {
  try {
    const { data } = await apiClient.get<{
      success: boolean;
      data: { sessionGroupId: number; questions: VocabTestQuestion[] };
    }>("/vocab-test/start", {
      params: { user_id: userId, session_group_id: sessionGroupId, study_phase: studyPhase },
    });
    return { success: true, data: data.data };
  } catch (err) {
    return { success: false, error: extractError(err) };
  }
}

export interface VocabTestSubmitResult {
  success: boolean;
  score: number;
  total: number;
  next_action: "transition" | "finish";
  new_condition?: string;
}

export type VocabTestType = "immediate" | "delayed";

export interface VocabTestProgress {
  immediateCompleted: number[];
  delayedCompleted: number[];
}

interface BackendVocabTestProgress {
  immediate_completed: number[];
  delayed_completed: number[];
}

export async function getVocabTestProgress(userId: string): Promise<VocabTestProgress> {
  const { data } = await apiClient.get<BackendVocabTestProgress>("/vocab-test/progress", {
    params: { user_id: userId },
  });
  return {
    immediateCompleted: (data.immediate_completed ?? []).map(Number),
    delayedCompleted:   (data.delayed_completed ?? []).map(Number),
  };
}

export interface DelayedVocabTestStatus {
  due: boolean;
  sessionGroupId: number | null;
  studyPhase: number | null;
  dueAt: string | null;
  minutesRemaining: number | null;
  delayMinutes: number | null;
}

interface BackendDelayedVocabTestStatus {
  due: boolean;
  session_group_id: number | null;
  study_phase: number | null;
  due_at: string | null;
  minutes_remaining: number | null;
  delay_minutes?: number | null;
}

export async function getDelayedVocabTestStatus(userId: string): Promise<DelayedVocabTestStatus> {
  const { data } = await apiClient.get<BackendDelayedVocabTestStatus>("/vocab-test/delayed-status", {
    params: { user_id: userId },
  });
  return {
    due:              data.due,
    sessionGroupId:   data.session_group_id,
    studyPhase:       data.study_phase,
    dueAt:            data.due_at,
    minutesRemaining: data.minutes_remaining,
    delayMinutes:     data.delay_minutes ?? null,
  };
}

export async function submitVocabTest(
  userId: string,
  sessionGroupId: number,
  answers: VocabTestAnswer[],
  score: number,
  studyPhase: number = 1,
  isFinal: boolean = false,
  testType: VocabTestType = "immediate",
): Promise<VocabTestSubmitResult> {
  const { data } = await apiClient.post<VocabTestSubmitResult>("/vocab-test/submit", {
    user_id:          userId,
    session_group_id: sessionGroupId,
    answers,
    score,
    submitted_at:     new Date().toISOString(),
    study_phase:      studyPhase,
    test_type:        testType,
    is_final:         isFinal,
  });
  return data;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Telemetry (lightweight — fire and forget)
// ─────────────────────────────────────────────────────────────────────────────

// Telemetry (disabled non-existent endpoints)
export function logWordLookup(): void {}
export function logDwellTime(): void {}

import type { WordInteraction } from "../types";

export function logInteraction(interaction: WordInteraction): Promise<void> {
  return apiClient.post("/telemetry/log", {
    session_id: interaction.sessionId,
    word_id: parseInt(interaction.wordId, 10),
    intent_tag: interaction.action,
    engagement_weight: interaction.weight,
  }).then(() => {});
}

// ─────────────────────────────────────────────────────────────────────────────
//  Activity (localStorage — client-side session tracking)
// ─────────────────────────────────────────────────────────────────────────────

export interface Activity {
  sessions: Array<{
    sessionId: string;
    title: string;
    topic: string;
    cefrLevel: string;
    isAdaptive: boolean;
    createdAt: string;
  }>;
}

const ACTIVITY_KEY = "leeswijs-activity";

export function readActivity(userId: string): Activity {
  try {
    const raw = localStorage.getItem(`${ACTIVITY_KEY}-${userId}`);
    return raw ? (JSON.parse(raw) as Activity) : { sessions: [] };
  } catch {
    return { sessions: [] };
  }
}

export function logSession(
  userId: string,
  entry: Activity["sessions"][number],
): void {
  const activity = readActivity(userId);
  const already = activity.sessions.some((s) => s.sessionId === entry.sessionId);
  if (!already) {
    activity.sessions.unshift(entry);
    localStorage.setItem(`${ACTIVITY_KEY}-${userId}`, JSON.stringify(activity));
  }
}

export function isBackendNotReadyMessage(msg: string): boolean {
  return msg.includes("backend") || msg.includes("503") || msg.includes("502");
}
