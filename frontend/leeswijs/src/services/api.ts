import axios from "axios";
import type {
  User,
  ReadingSession,
  FlashcardItem,
  AssessmentResult,
  AssessmentBatch,
  WordInteraction,
  SurveyResponse,
  ApiResponse,
} from "../types";
import {
  mockUser,
  mockReadingSession,
  mockFlashcards,
  mockAssessmentBatches,
} from "../mocks/data";

// ── Axios instance ────────────────────────────────────────────────────────────

export const apiClient = axios.create({
  baseURL: "http://localhost:8000/api",
  timeout: 10_000,
  headers: { "Content-Type": "application/json" },
});

// ── Helpers ───────────────────────────────────────────────────────────────────

const delay = (ms = 300) => new Promise<void>((res) => setTimeout(res, ms));

function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

// ── Mock flag ─────────────────────────────────────────────────────────────────
// Set to false to hit the real FastAPI backend.

export const USE_MOCK = true;

// ── API functions ─────────────────────────────────────────────────────────────

/**
 * Fetch the current authenticated user's profile.
 */
export async function getUser(): Promise<ApiResponse<User>> {
  if (USE_MOCK) {
    await delay();
    return ok(mockUser);
  }
  const { data } = await apiClient.get<ApiResponse<User>>("/user/me");
  return data;
}

/**
 * Fetch (or generate) a reading session.
 * Pass "new" to generate a fresh adaptive session.
 */
export async function getReadingSession(
  sessionId: string
): Promise<ApiResponse<ReadingSession>> {
  if (USE_MOCK) {
    await delay();
    return ok({ ...mockReadingSession, sessionId });
  }
  const { data } = await apiClient.get<ApiResponse<ReadingSession>>(
    `/sessions/${sessionId}`
  );
  return data;
}

/**
 * Fetch flashcard items due for review or initial learning.
 */
export async function getFlashcards(): Promise<ApiResponse<FlashcardItem[]>> {
  if (USE_MOCK) {
    await delay();
    return ok(mockFlashcards);
  }
  const { data } = await apiClient.get<ApiResponse<FlashcardItem[]>>("/flashcards");
  return data;
}

/**
 * Fetch an assessment batch by batch number (1-indexed).
 */
export async function getAssessmentBatch(
  batchNumber: number
): Promise<ApiResponse<AssessmentBatch>> {
  if (USE_MOCK) {
    await delay();
    const batch =
      mockAssessmentBatches[batchNumber - 1] ?? mockAssessmentBatches[0];
    return ok(batch);
  }
  const { data } = await apiClient.get<ApiResponse<AssessmentBatch>>(
    `/assessment/batch/${batchNumber}`
  );
  return data;
}

/**
 * Submit final assessment answers. Returns estimated CEFR level.
 */
export async function submitAssessment(
  result: AssessmentResult
): Promise<ApiResponse<AssessmentResult>> {
  if (USE_MOCK) {
    await delay();
    return ok(result);
  }
  const { data } = await apiClient.post<ApiResponse<AssessmentResult>>(
    "/assessment/submit",
    result
  );
  return data;
}

/**
 * Log a single word interaction event (see examples / add to learn / ignore).
 */
export async function logInteraction(
  interaction: WordInteraction
): Promise<ApiResponse<null>> {
  if (USE_MOCK) {
    await delay(100); // fire-and-forget feel
    return ok(null);
  }
  const { data } = await apiClient.post<ApiResponse<null>>(
    "/interactions",
    interaction
  );
  return data;
}

/**
 * Submit the post-reading UES-SF survey for a session.
 */
export async function submitSurvey(
  response: SurveyResponse
): Promise<ApiResponse<null>> {
  if (USE_MOCK) {
    await delay();
    return ok(null);
  }
  const { data } = await apiClient.post<ApiResponse<null>>(
    "/surveys",
    response
  );
  return data;
}
