import {
  apiClient,
  extractError,
  readingGenerationTimeoutMs,
} from "./http";
import { mapSessionResponse } from "./sessionMapper";
import type {
  ApiResponse,
  AssessmentBatchData,
  FlashcardItem,
  LexiconEntry,
  ReadingSession,
  SessionSummary,
  SurveyResponse,
  User,
  VocabTestAnswer,
  VocabTestQuestion,
  WordInteraction,
} from "../types";

export { apiClient } from "./http";

interface BackendAuthResponse {
  user_id: string;
  email: string;
  display_name?: string;
  estimated_cefr?: string;
  onboarding_completed: boolean;
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

function mapAuthResponseToUser(data: BackendAuthResponse): User {
  return {
    id: data.user_id,
    user_id: data.user_id,
    email: data.email,
    name: data.display_name || data.email.split("@")[0],
    display_name: data.display_name || "",
    interests: [],
    cefrLevel: (data.estimated_cefr as User["cefrLevel"]) ?? null,
    assessedAt: null,
    createdAt: new Date().toISOString(),
    onboarding_completed: data.onboarding_completed,
    has_switched_conditions: data.has_switched_conditions ?? false,
  };
}

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

export async function fetchMe(userId: string): Promise<User> {
  try {
    const { data } = await apiClient.get<{ success: boolean; data: Record<string, unknown> }>(
      "/users/me",
      { headers: { "X-User-Id": userId } },
    );
    const profileData = data.data;
    return {
      id: String(profileData.id ?? profileData.user_id ?? ""),
      user_id: String(profileData.user_id ?? ""),
      email: String(profileData.email ?? ""),
      name: String(profileData.display_name || profileData.name || ""),
      display_name: String(profileData.display_name ?? ""),
      interests: Array.isArray(profileData.interests) ? (profileData.interests as string[]) : [],
      cefrLevel: (profileData.cefrLevel as User["cefrLevel"]) ?? null,
      assessedAt: null,
      createdAt: String(profileData.createdAt ?? ""),
      onboarding_completed: Boolean(profileData.onboarding_completed),
      age: typeof profileData.age === "number" ? profileData.age : null,
      city: typeof profileData.city === "string" ? profileData.city : null,
      job: typeof profileData.job === "string" ? profileData.job : null,
      academic_background: typeof profileData.academic_background === "string" ? profileData.academic_background : null,
      mother_language: typeof profileData.mother_language === "string" ? profileData.mother_language : null,
      other_languages: typeof profileData.other_languages === "string" ? profileData.other_languages : null,
      purpose: typeof profileData.purpose === "string" ? (profileData.purpose as User["purpose"]) : null,
    };
  } catch (err) {
    throw new Error(extractError(err));
  }
}

export async function saveProfile(user: Partial<User> & { id: string }): Promise<void> {
  try {
    await apiClient.put(
      "/users/me/profile",
      {
        display_name: user.display_name,
        age: user.age,
        city: user.city,
        job: user.job,
        academic_background: user.academic_background,
        mother_language: user.mother_language,
        other_languages: user.other_languages,
        purpose: user.purpose,
        interests: user.interests,
        estimated_cefr: user.cefrLevel,
      },
      { headers: { "X-User-Id": user.id } },
    );
  } catch (err) {
    throw new Error(extractError(err));
  }
}

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

export async function savePersonalInfo(
  userId: string,
  info: {
    display_name?: string;
    age?: number;
    city?: string;
    job?: string;
    academic_background?: string;
    mother_language?: string;
    other_languages?: string;
    purpose?: string;
    self_reported_cefr?: string;
  },
): Promise<void> {
  try {
    await apiClient.post("/onboarding/personal-info", { user_id: userId, ...info });
  } catch (err) {
    throw new Error(extractError(err));
  }
}

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
        user_id: userId,
        batch_number: batchNumber,
        self_reported_cefr: selfReportedCefr,
        known_words: knownWords ?? [],
        all_words: allWords ?? [],
      },
    );
    return {
      success: true,
      data: {
        batchNumber: Number(data.batch_number ?? batchNumber),
        totalBatches: Number(data.total_batches ?? 1),
        words: (data.words || []).map((w) => ({
          wordId: String(w.word_id),
          dutch: String(w.dutch),
          english: typeof w.english === "string" ? w.english : undefined,
          isPseudo: Boolean(w.is_pseudo),
        })),
      },
    };
  } catch (err) {
    return { success: false, error: extractError(err) };
  }
}

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
      user_id: userId,
      batch_number: batchNumber,
      known_word_ids: knownWordIds,
      all_word_ids: allWordIds,
      estimated_level: estimatedLevel,
      confidence_score: confidenceScore,
      is_final: isFinal,
    });
  } catch (err) {
    throw new Error(extractError(err));
  }
}

export async function generateSession(userId: string): Promise<{ sessionId: string; readingNumber: number }> {
  try {
    const { data } = await apiClient.post<Record<string, unknown>>(
      "/session/generate",
      {
        user_id: userId,
      },
      { timeout: readingGenerationTimeoutMs },
    );
    return {
      sessionId: String(data.session_id),
      readingNumber: Number(data.reading_number ?? 1),
    };
  } catch (err) {
    throw new Error(extractError(err));
  }
}

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

export async function continueSession(
  userId: string,
  previousSessionId: string,
): Promise<ReadingSession> {
  try {
    const { data } = await apiClient.post<Record<string, unknown>>(
      "/session/continue",
      {
        user_id: userId,
        previous_session_id: previousSessionId,
      },
      { timeout: readingGenerationTimeoutMs },
    );
    return mapSessionResponse(data);
  } catch (err) {
    throw new Error(extractError(err));
  }
}

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

export async function addToLearnList(
  userId: string,
  wordId: number,
  reviewIntervalDays?: number,
  force?: boolean
): Promise<void> {
  await apiClient.patch("/vocab/add-to-learn", {
    user_id: userId,
    word_id: wordId,
    review_interval_days: reviewIntervalDays,
    force: force,
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

export async function markWordDecision(
  userId: string,
  wordId: number,
  studyPhase: number,
  toTested: boolean,
): Promise<void> {
  await apiClient.post("/onboarding/words/mark-decision", {
    user_id: userId,
    word_id: wordId,
    study_phase: studyPhase,
    to_be_tested: toTested,
  });
}

export async function submitSurvey(
  survey: SurveyResponse,
): Promise<ApiResponse<{ signal: Record<string, unknown> }>> {
  try {
    const { data } = await apiClient.post<{ success: boolean; signal: Record<string, unknown> }>(
      "/surveys",
      {
        sessionId: String(survey.sessionId),
        worthMyTime: survey.worthMyTime,
        appropriateChallenge: survey.appropriateChallenge,
        comprehension: survey.comprehension,
        focusedAttention: survey.focusedAttention,
        reward: survey.reward,
        perceivedRelevance: survey.perceivedRelevance,
        mentalEffort: survey.mentalEffort,
        perceivedPersonalization: survey.perceivedPersonalization,
        duration_seconds: survey.duration_seconds,
      },
    );
    return { success: true, data: { signal: data.signal } };
  } catch (err) {
    return { success: false, error: extractError(err) };
  }
}

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
  userId?: string | null,
  studyPhase?: number | null,
): Promise<ApiResponse<FlashcardsResponse>> {
  if (!userId) return { success: false, error: "No user" };
  try {
    const params: Record<string, string | number> = { user_id: userId };
    if (studyPhase != null) params.study_phase = studyPhase;
    const { data } = await apiClient.get<FlashcardsResponse>("/flashcards", { params });
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

export async function discoverPrefetch(
  userId: string,
  studyPhase?: number | null,
): Promise<{ words: DiscoverCard[]; remaining: number }> {
  try {
    const params: Record<string, string | number> = { user_id: userId };
    if (studyPhase != null) params.study_phase = studyPhase;
    const { data } = await apiClient.get<{ words: DiscoverCard[]; remaining: number }>(
      "/flashcards/discover-prefetch",
      { params },
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
    user_id: userId,
    word_id: parseInt(wordId, 10),
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

export async function addDiscoveredToLearn(
  userId: string,
  wordId: string,
  intervalDays = 1,
): Promise<void> {
  await apiClient.post("/flashcards/add-to-learn", {
    user_id: userId,
    word_id: parseInt(wordId, 10),
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
  phase_switched?: boolean;
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
    delayedCompleted: (data.delayed_completed ?? []).map(Number),
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
    due: data.due,
    sessionGroupId: data.session_group_id,
    studyPhase: data.study_phase,
    dueAt: data.due_at,
    minutesRemaining: data.minutes_remaining,
    delayMinutes: data.delay_minutes ?? null,
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
    user_id: userId,
    session_group_id: sessionGroupId,
    answers,
    score,
    submitted_at: new Date().toISOString(),
    study_phase: studyPhase,
    test_type: testType,
    is_final: isFinal,
  });
  return data;
}

export function logInteraction(interaction: WordInteraction): Promise<void> {
  return apiClient.post("/telemetry/log", {
    session_id: interaction.sessionId,
    word_id: parseInt(interaction.wordId, 10),
    intent_tag: interaction.action,
    engagement_weight: interaction.weight,
  }).then(() => {});
}

export interface Activity {
  sessions: Array<{
    sessionId: string;
    title: string;
    topic: string;
    cefrLevel: string;
    createdAt: string;
  }>;
}

const activityKey = "leeswijs-activity";

export function readActivity(userId: string): Activity {
  try {
    const raw = localStorage.getItem(`${activityKey}-${userId}`);
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
    localStorage.setItem(`${activityKey}-${userId}`, JSON.stringify(activity));
  }
}

export function isBackendNotReadyMessage(msg: string): boolean {
  return msg.includes("backend") || msg.includes("503") || msg.includes("502");
}
