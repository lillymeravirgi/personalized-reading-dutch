import axios from "axios";
import type {
  User,
  CefrLevel,
  ReadingSession,
  FlashcardItem,
  AssessmentResult,
  AssessmentBatch,
  WordInteraction,
  SurveyResponse,
  ApiResponse,
  VocabTest,
  VocabTestPhase,
  VocabTestResult,
  BilingualSentence,
  HighlightedWord,
} from "../types";
import {
  mockUser,
  mockReadingSession,
  mockFlashcards,
  mockAssessmentBatches,
  mockVocabTest,
} from "../mocks/data";

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000/api",
  timeout: 10_000,
  headers: { "Content-Type": "application/json" },
});

const SESSION_GENERATION_TIMEOUT_MS = 60_000;

apiClient.interceptors.request.use((config) => {
  const userId = getPersistedUserId();
  if (userId) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>)["X-User-Id"] = userId;
  }
  const token = getPersistedAuthToken();
  if (token) {
    config.headers = config.headers ?? {};
    (config.headers as Record<string, string>).Authorization = `Bearer ${token}`;
  }
  return config;
});

const delay = (ms = 300) => new Promise<void>((res) => setTimeout(res, ms));

function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

function fail<T>(error: string): ApiResponse<T> {
  return { success: false, error };
}

export const BACKEND_NOT_READY_MESSAGE =
  "This feature needs backend support.";

export function isBackendNotReadyMessage(message: string | null | undefined): boolean {
  return message === BACKEND_NOT_READY_MESSAGE;
}

function apiErrorMessage(err: unknown, fallback: string): string {
  const detail =
    (err as { response?: { data?: { detail?: unknown } } })?.response?.data
      ?.detail;

  if (axios.isAxiosError(err)) {
    if (err.response?.status === 404 || err.response?.status === 405) {
      return BACKEND_NOT_READY_MESSAGE;
    }
    if (err.code === "ECONNABORTED") {
      return "The request took too long. Please try again.";
    }
  }

  if (typeof detail === "string" && detail.trim()) return detail;

  return fallback;
}

function asApiResponse<T>(data: T | ApiResponse<T>): ApiResponse<T> {
  if (
    typeof data === "object" &&
    data !== null &&
    "success" in data &&
    typeof (data as { success: unknown }).success === "boolean"
  ) {
    return data as ApiResponse<T>;
  }
  return ok(data as T);
}

export const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

type BackendWordInfo = {
  word_id: number;
  word: string;
  translation: string;
  cefr_level: string;
  examples?: BilingualSentence[] | null;
};

type BackendSessionPayload = {
  session_id: number;
  title: string;
  content: string;
  topic_used: string | null;
  condition: "ADAPTIVE" | "BASELINE";
  blue_words: BackendWordInfo[];
  yellow_words: BackendWordInfo[];
};

function toReadingSession(payload: BackendSessionPayload): ReadingSession {
  if (isBackendGenerationFailure(payload.content)) {
    throw new Error(
      "This reading was not created correctly because the text generator was rate limited. Please start a new reading."
    );
  }

  const { text, highlights } = extractHighlights(
    payload.content,
    payload.blue_words,
    payload.yellow_words
  );

  const level =
    payload.blue_words[0]?.cefr_level ??
    payload.yellow_words[0]?.cefr_level ??
    "A1";

  return {
    sessionId: String(payload.session_id),
    text,
    title: payload.title,
    topic: payload.topic_used ?? "general",
    cefrLevel: level,
    highlights,
    isAdaptive: payload.condition === "ADAPTIVE",
  };
}

function isBackendGenerationFailure(content: string): boolean {
  return content.trim().startsWith("Er is een fout opgetreden bij het genereren");
}

function extractHighlights(
  content: string,
  blueWords: BackendWordInfo[],
  yellowWords: BackendWordInfo[]
): { text: string; highlights: HighlightedWord[] } {
  const blueByWord = byWord(blueWords);
  const yellowByWord = byWord(yellowWords);
  const highlights: HighlightedWord[] = [];
  let text = "";
  let cursor = 0;
  const marker = /\[\[([^\]]+)\]\]/g;

  for (const match of content.matchAll(marker)) {
    const full = match[0];
    const word = match[1].trim();
    const start = match.index ?? 0;
    text += content.slice(cursor, start);

    const cleanStart = text.length;
    text += word;
    const cleanEnd = text.length;

    const key = word.toLowerCase();
    const blue = blueByWord.get(key);
    const yellow = yellowByWord.get(key);
    const source = blue ?? yellow;
    if (source) {
      highlights.push({
        wordId: String(source.word_id),
        dutch: word,
        english: source.translation,
        startIndex: cleanStart,
        endIndex: cleanEnd,
        highlightType: blue ? "unknown" : "learning",
        exampleSentences: source.examples ?? [],
        usageFrequency: "common",
      });
    }

    cursor = start + full.length;
  }

  text += content.slice(cursor);
  return { text, highlights };
}

function byWord(words: BackendWordInfo[]): Map<string, BackendWordInfo> {
  return new Map(words.map((word) => [word.word.toLowerCase(), word]));
}

function getPersistedUserId(): string | null {
  try {
    const raw = localStorage.getItem("leeswijs-store");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { user?: { id?: string } } };
    return parsed.state?.user?.id ?? null;
  } catch (err) {
    const message = apiErrorMessage(err, "Translation is not available yet.");
    if (isBackendNotReadyMessage(message)) {
      throw new Error(message);
    }
    return null;
  }
}

function getPersistedAuthToken(): string | null {
  try {
    return localStorage.getItem("leeswijs-token");
  } catch {
    return null;
  }
}

function toNumericId(value: string, label: string): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Cannot send ${label} id '${value}' to the backend yet.`);
  }
  return n;
}

function toBackendIntent(action: WordInteraction["action"]) {
  if (action === "see_examples") return "DEEP_PROCESSING";
  if (action === "add_to_learn") return "ACQUISITION_INTENT";
  return "WORD_AVOIDANCE";
}

export async function getUser(): Promise<ApiResponse<User>> {
  if (USE_MOCK) {
    await delay();
    return ok(mockUser);
  }
  const { data } = await apiClient.get<ApiResponse<User>>("/users/me");
  return data;
}

export async function getReadingSession(
  sessionId: string,
  userId?: string
): Promise<ApiResponse<ReadingSession>> {
  if (USE_MOCK) {
    await delay();
    return ok({ ...mockReadingSession, sessionId });
  }
  const { data } = await apiClient.get<BackendSessionPayload>(
    `/session/${Number(sessionId)}`,
    { params: { user_id: userId ?? getPersistedUserId() } }
  );
  return ok(toReadingSession(data));
}

type GenerateSessionPayload = {
  session_id: number;
  title: string;
  content: string;
  topic_used: string | null;
};

export async function generateSession(
  userId: string,
  condition?: "ADAPTIVE" | "BASELINE"
): Promise<{ sessionId: string }> {
  if (USE_MOCK) {
    await delay(600);
    return { sessionId: mockReadingSession.sessionId };
  }
  try {
    const body =
      condition === undefined ? { user_id: userId } : { user_id: userId, condition };
    const { data } = await apiClient.post<GenerateSessionPayload>(
      "/session/generate",
      body,
      { timeout: SESSION_GENERATION_TIMEOUT_MS }
    );
    return { sessionId: String(data.session_id) };
  } catch (err) {
    const timeout =
      axios.isAxiosError(err) && err.code === "ECONNABORTED";
    throw new Error(
      apiErrorMessage(
        err,
        (timeout
          ? "The text generator is taking longer than expected. Please try again."
          : "Could not generate a new session.")
      )
    );
  }
}

export async function continueSession(
  userId: string,
  previousSessionId: string,
): Promise<{ sessionId: string }> {
  if (USE_MOCK) {
    await delay(600);
    return { sessionId: mockReadingSession.sessionId };
  }
  try {
    const { data } = await apiClient.post<GenerateSessionPayload>(
      "/session/continue",
      {
        user_id: userId,
        previous_session_id: Number(previousSessionId),
      },
      { timeout: SESSION_GENERATION_TIMEOUT_MS },
    );
    return { sessionId: String(data.session_id) };
  } catch (err) {
    throw new Error(apiErrorMessage(err, "Could not generate a continuation."));
  }
}

type BackendFlashcardItem = {
  word_id: string;
  dutch: string;
  english: string;
  example_sentence: { nl: string; en: string };
  difficulty: number;
  mode: "learning" | "review" | string;
  next_review_date: string | null;
  review_interval: string | null;
};

function toFlashcardItem(b: BackendFlashcardItem): FlashcardItem {
  return {
    wordId: b.word_id,
    dutch: b.dutch,
    english: b.english,
    exampleSentence: { nl: b.example_sentence.nl, en: b.example_sentence.en },
    difficulty: b.difficulty,
    mode: b.mode === "review" ? "review" : "learning",
    nextReviewDate: b.next_review_date,
    reviewInterval: (b.review_interval as FlashcardItem["reviewInterval"]) ?? null,
  };
}

function flashcardsFromSession(session: ReadingSession): FlashcardItem[] {
  const seen = new Set<string>();
  return session.highlights
    .filter((word) => {
      if (seen.has(word.wordId)) return false;
      seen.add(word.wordId);
      return true;
    })
    .slice(0, 8)
    .map((word) => ({
      wordId: word.wordId,
      dutch: word.dutch,
      english: word.english,
      exampleSentence:
        word.exampleSentences[0] ?? {
          nl: word.dutch,
          en: word.english,
        },
      difficulty: word.highlightType === "unknown" ? 0.65 : 0.45,
      mode: word.highlightType === "learning" ? "review" : "learning",
      nextReviewDate: null,
      reviewInterval: null,
    }));
}

function vocabTestFromSession(
  session: ReadingSession,
  phase: VocabTestPhase
): VocabTest {
  const fallbackDistractors = [
    "development",
    "choice",
    "environment",
    "question",
    "system",
    "example",
    "sound",
    "problem",
  ];
  const words = flashcardsFromSession(session).slice(0, 5);
  const allMeanings = words.map((word) => word.english).filter(Boolean);

  return {
    sessionId: session.sessionId,
    phase,
    questions: words.map((word, index) => {
      const distractors = [...allMeanings, ...fallbackDistractors]
        .filter((option) => option !== word.english)
        .filter((option, optionIndex, arr) => arr.indexOf(option) === optionIndex)
        .slice(0, 3);
      const correctIndex = index % 4;
      const options = [...distractors];
      options.splice(correctIndex, 0, word.english);
      return {
        questionId: `local-${session.sessionId}-${word.wordId}`,
        wordId: word.wordId,
        dutch: word.dutch,
        prompt: `What does ${word.dutch} mean?`,
        options,
        correctIndex,
      };
    }),
  };
}

export async function getFlashcards(
  sessionId?: string | null,
  userId?: string
): Promise<ApiResponse<FlashcardItem[]>> {
  if (USE_MOCK) {
    await delay();
    return ok(mockFlashcards);
  }
  const effectiveUserId = userId ?? getPersistedUserId();
  if (!effectiveUserId) return ok([]);
  try {
    const { data } = await apiClient.get<BackendFlashcardItem[]>("/flashcards", {
      params: { user_id: effectiveUserId },
    });
    return ok(data.map(toFlashcardItem));
  } catch (err) {
    const message = apiErrorMessage(err, "Could not load flashcards.");
    if (sessionId && isBackendNotReadyMessage(message)) {
      try {
        const session = await getReadingSession(sessionId, effectiveUserId);
        if (session.success) return ok(flashcardsFromSession(session.data));
      } catch {
        return fail("Review words from this reading are not available yet.");
      }
    }
    return fail(message);
  }
}

export async function getVocabTest(
  sessionId: string,
  phase: VocabTestPhase = "IMMEDIATE"
): Promise<ApiResponse<VocabTest>> {
  if (USE_MOCK) {
    await delay();
    return ok({ ...mockVocabTest, sessionId, phase });
  }
  try {
    const { data } = await apiClient.get<ApiResponse<VocabTest> | VocabTest>(
      "/vocab-test/start",
      { params: { session_id: sessionId, phase } }
    );
    return asApiResponse(data);
  } catch (err) {
    const message = apiErrorMessage(err, "Could not load the vocabulary test.");
    if (isBackendNotReadyMessage(message)) {
      try {
        const session = await getReadingSession(
          sessionId,
          getPersistedUserId() ?? undefined
        );
        if (session.success) return ok(vocabTestFromSession(session.data, phase));
      } catch {
        return fail("Vocabulary check for this reading is not available yet.");
      }
    }
    return fail(message);
  }
}

export async function submitVocabTestResult(
  result: VocabTestResult
): Promise<ApiResponse<VocabTestResult>> {
  if (USE_MOCK) {
    await delay();
    return ok(result);
  }
  try {
    const { data } = await apiClient.post<ApiResponse<VocabTestResult> | VocabTestResult>(
      "/vocab-test/submit",
      result
    );
    return asApiResponse(data);
  } catch (err) {
    const message = apiErrorMessage(err, "Could not submit the vocabulary test.");
    if (isBackendNotReadyMessage(message)) {
      return ok(result);
    }
    return fail(message);
  }
}

type BackendAssessmentWord = {
  word_id: string;
  dutch: string;
  english?: string | null;
  is_pseudo: boolean;
};
type BackendAssessmentBatch = {
  batch_number: number;
  total_batches: number;
  words: BackendAssessmentWord[];
};

function toAssessmentBatch(payload: BackendAssessmentBatch): AssessmentBatch {
  return {
    batchNumber: payload.batch_number,
    totalBatches: payload.total_batches,
    words: payload.words.map((w) => ({
      wordId: w.word_id,
      dutch: w.dutch,
      english: w.english ?? undefined,
      isPseudo: w.is_pseudo,
    })),
  };
}

export async function getAssessmentBatch(
  batchNumber: number
): Promise<ApiResponse<AssessmentBatch>> {
  if (USE_MOCK) {
    await delay();
    const batch =
      mockAssessmentBatches[batchNumber - 1] ?? mockAssessmentBatches[0];
    return ok(batch);
  }
  const { data } = await apiClient.get<BackendAssessmentBatch>(
    `/assessment/batch/${batchNumber}`
  );
  return ok(toAssessmentBatch(data));
}

export async function submitAssessment(
  result: AssessmentResult
): Promise<ApiResponse<AssessmentResult>> {
  if (USE_MOCK) {
    await delay();
    return ok(result);
  }
  const userId = getPersistedUserId();
  await apiClient.post("/assessment/submit", {
    user_id: userId,
    known_word_ids: result.knownWordIds,
    unknown_word_ids: result.unknownWordIds,
    estimated_level: result.estimatedLevel,
    confidence_score: result.confidenceScore,
  });
  if (userId) {
    apiClient.post(`/krs/run/${encodeURIComponent(userId)}`).catch(() => {});
  }
  return ok(result);
}

export type SessionLogEntry = {
  sessionId: string;
  title: string;
  topic: string;
  cefrLevel: string;
  isAdaptive: boolean;
  createdAt: string;
  dwellMs: number;
};

export type Activity = {
  sessions: SessionLogEntry[];
  wordsLookedUp: number;
  flashcardsRemembered: number;
  flashcardsForgot: number;
  dailyMinutes: Record<string, number>;
};

const ACTIVITY_KEY_PREFIX = "leeswijs-activity-";
const CONDITION_KEY       = "leeswijs-condition";
const MAX_READING_DWELL_MS = 2 * 60 * 60 * 1000;
const MAX_DAILY_MINUTES    = 8 * 60;

function emptyActivity(): Activity {
  return {
    sessions: [],
    wordsLookedUp: 0,
    flashcardsRemembered: 0,
    flashcardsForgot: 0,
    dailyMinutes: {},
  };
}

function safeNumber(value: unknown, max: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

function sanitizeActivity(activity: Partial<Activity>): Activity {
  const sessions = Array.isArray(activity.sessions)
    ? activity.sessions
        .map((entry) => {
          const s = entry as Partial<SessionLogEntry>;
          if (!s.sessionId) return null;
          return {
            sessionId: String(s.sessionId),
            title: String(s.title ?? "Untitled reading"),
            topic: String(s.topic ?? ""),
            cefrLevel: String(s.cefrLevel ?? ""),
            isAdaptive: Boolean(s.isAdaptive),
            createdAt: String(s.createdAt ?? new Date().toISOString()),
            dwellMs: safeNumber(s.dwellMs, MAX_READING_DWELL_MS),
          };
        })
        .filter((entry): entry is SessionLogEntry => entry !== null)
    : [];

  const dailyMinutes: Record<string, number> = {};
  for (const [key, value] of Object.entries(activity.dailyMinutes ?? {})) {
    dailyMinutes[key] = safeNumber(value, MAX_DAILY_MINUTES);
  }

  return {
    sessions,
    wordsLookedUp: safeNumber(activity.wordsLookedUp, 100_000),
    flashcardsRemembered: safeNumber(activity.flashcardsRemembered, 100_000),
    flashcardsForgot: safeNumber(activity.flashcardsForgot, 100_000),
    dailyMinutes,
  };
}

export function readActivity(username: string): Activity {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY_PREFIX + username);
    if (!raw) return emptyActivity();
    const parsed = JSON.parse(raw) as Partial<Activity>;
    return sanitizeActivity({ ...emptyActivity(), ...parsed });
  } catch {
    return emptyActivity();
  }
}

function writeActivity(username: string, a: Activity): void {
  try {
    localStorage.setItem(ACTIVITY_KEY_PREFIX + username, JSON.stringify(a));
  } catch {
    return;
  }
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function logSession(
  username: string,
  session: Omit<SessionLogEntry, "dwellMs">
): void {
  const a = readActivity(username);
  if (!a.sessions.some((s) => s.sessionId === session.sessionId)) {
    a.sessions.push({ ...session, dwellMs: 0 });
    writeActivity(username, a);
  }
}

export function logDwellTime(
  username: string,
  sessionId: string,
  ms: number
): void {
  const safeMs = safeNumber(ms, MAX_READING_DWELL_MS);
  if (safeMs <= 0) return;
  const a = readActivity(username);
  const idx = a.sessions.findIndex((s) => s.sessionId === sessionId);
  if (idx >= 0) {
    a.sessions[idx].dwellMs = safeNumber(
      a.sessions[idx].dwellMs + safeMs,
      MAX_READING_DWELL_MS
    );
  }
  const key = todayKey();
  a.dailyMinutes[key] = safeNumber(
    (a.dailyMinutes[key] ?? 0) + safeMs / 60_000,
    MAX_DAILY_MINUTES
  );
  writeActivity(username, a);
}

export function logWordLookup(username: string): void {
  const a = readActivity(username);
  a.wordsLookedUp += 1;
  writeActivity(username, a);
}

export function logFlashcardReview(
  username: string,
  remembered: boolean
): void {
  const a = readActivity(username);
  if (remembered) a.flashcardsRemembered += 1;
  else a.flashcardsForgot += 1;
  writeActivity(username, a);
}

export async function submitFlashcardReview(
  userId: string,
  wordId: string,
  remembered: boolean,
): Promise<ApiResponse<null>> {
  if (USE_MOCK) {
    await delay(100);
    return ok(null);
  }
  try {
    await apiClient.post("/flashcards/review", null, {
      params: {
        user_id: userId,
        word_id: toNumericId(wordId, "word"),
        remembered,
      },
    });
    return ok(null);
  } catch (err) {
    return fail(apiErrorMessage(err, "Could not save flashcard review."));
  }
}

export function resetLocalData(username: string): void {
  try {
    localStorage.removeItem(ACTIVITY_KEY_PREFIX + username);
    const pw = readMap<string>(PASSWORDS_KEY);
    delete pw[username];
    writeMap(PASSWORDS_KEY, pw);
    const pf = readMap<StoredProfile>(PROFILES_KEY);
    delete pf[username];
    writeMap(PROFILES_KEY, pf);
  } catch {
    return;
  }
}

export type Condition = "ADAPTIVE" | "BASELINE";

export function getCondition(): Condition {
  const v = (() => {
    try { return localStorage.getItem(CONDITION_KEY); }
    catch { return null; }
  })();
  return v === "BASELINE" ? "BASELINE" : "ADAPTIVE";
}

export function setCondition(c: Condition): void {
  try { localStorage.setItem(CONDITION_KEY, c); } catch { return; }
}

const MOCK_DICT: Record<string, string> = {
  de: "the", het: "the / it", een: "a / an", van: "of / from", en: "and",
  is: "is", zijn: "are / to be", niet: "not", nog: "still / yet", maar: "but",
  ook: "also", op: "on", in: "in", tot: "until / to", naar: "to",
  fijn: "nice / pleasant", horen: "to hear", instrumenten: "instruments",
  klinken: "sound", zit: "sits / is sitting", heeft: "has",
  kleine: "small", tablet: "tablet",
  dag: "day", elke: "every", nieuwe: "new", grote: "big", grootste: "biggest",
  meer: "more", beter: "better", hoe: "how", dat: "that", die: "that / those",
  deze: "this / these", er: "there", toch: "yet / still", juist: "precisely",
  worden: "are / become", wordt: "is (becomes)", gaat: "goes", snel: "fast",
  leert: "learns", ziet: "sees", uitvoeren: "perform", analyseren: "analyze",
  schrijven: "write", doen: "do", lijken: "seem", wijzen: "point",
  zeggen: "say", creëert: "creates", biedt: "offers", oplossen: "solve",
  kunnen: "can", modellen: "models", taken: "tasks", teksten: "texts",
  mogelijkheden: "possibilities", wetenschappers: "scientists",
  grenzen: "limits", technologie: "technology", uitdagingen: "challenges",
  informatie: "information", afbeeldingen: "images", geluid: "sound",
  systeem: "system", zorgen: "worries", critici: "critics",
  impact: "impact", arbeidsmarkt: "labor market", voorstanders: "advocates",
  banen: "jobs", problemen: "problems", mensen: "people", alleen: "only",
  toekomst: "future", discussie: "discussion", over: "about",
  ongestructureerde: "unstructured", gepubliceerd: "published",
  complexe: "complex", hoeveelheden: "quantities", eindeloos: "endless",
  intensief: "intensive", hiervoor: "for this", miljoenen: "millions",
  voorbeelden: "examples", gebruikt: "used", mogelijke: "possible",
  lang: "long", voorbij: "past / over", zoals: "such as",
};

function normalizeLookupKey(word: string): string {
  return word
    .trim()
    .toLowerCase()
    .replace(/^[^\p{L}'-]+|[^\p{L}'-]+$/gu, "");
}

export async function defineWord(word: string): Promise<string | null> {
  const key = normalizeLookupKey(word);
  if (!key) return null;
  if (USE_MOCK) {
    await delay(150);
    return MOCK_DICT[key] ?? null;
  }
  try {
    const { data } = await apiClient.get<{ translation?: string }>(
      `/lexicon/define/${encodeURIComponent(word)}`
    );
    return data.translation ?? null;
  } catch {
    return null;
  }
}

export async function addToLearn(
  word: string,
  english: string | null
): Promise<void> {
  if (USE_MOCK) {
    await delay(150);
    return;
  }
  try {
    await apiClient.patch("/vocab/add-plain-word", {
      user_id: getPersistedUserId(),
      word,
      english,
    });
  } catch (err) {
    throw new Error(apiErrorMessage(err, "Could not add this word."));
  }
}

export async function logInteraction(
  interaction: WordInteraction
): Promise<ApiResponse<null>> {
  if (USE_MOCK) {
    await delay(100);
    return ok(null);
  }
  const wordId = toNumericId(interaction.wordId, "word");
  const sessionId = toNumericId(interaction.sessionId, "session");
  const userId = getPersistedUserId();

  if (interaction.action === "add_to_learn" && userId) {
    await apiClient.patch("/vocab/add-to-learn", {
      user_id: userId,
      word_id: wordId,
    });
  }

  await apiClient.post("/telemetry/log", {
    session_id: sessionId,
    word_id: wordId,
    intent_tag: toBackendIntent(interaction.action),
    engagement_weight: interaction.weight,
  });
  return ok(null);
}

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

type LoginPayload = {
  access_token?: string;
  user_id: string;
  username: string;
  display_name: string;
  estimated_cefr: string | null;
  interests?: string[];
  assessed_at?: string | null;
  created_at?: string | null;
};

const VALID_USERNAMES = Array.from({ length: 13 }, (_, i) =>
  `user${String(i + 1).padStart(2, "0")}`
);

const PASSWORDS_KEY = "leeswijs-passwords";
const PROFILES_KEY  = "leeswijs-profiles";

type StoredProfile = {
  interests: string[];
  cefrLevel: CefrLevel | null;
  assessedAt?: string | null;
};

function readMap<T>(key: string): Record<string, T> {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Record<string, T>) : {};
  } catch {
    return {};
  }
}

function writeMap<T>(key: string, map: Record<string, T>): void {
  try {
    localStorage.setItem(key, JSON.stringify(map));
  } catch {
    return;
  }
}

function getStoredPassword(username: string): string {
  return readMap<string>(PASSWORDS_KEY)[username] ?? username;
}

function setStoredPassword(username: string, newPassword: string): void {
  const map = readMap<string>(PASSWORDS_KEY);
  map[username] = newPassword;
  writeMap(PASSWORDS_KEY, map);
}

function getStoredProfile(username: string): StoredProfile | null {
  return readMap<StoredProfile>(PROFILES_KEY)[username] ?? null;
}

function setStoredProfile(username: string, profile: StoredProfile): void {
  const map = readMap<StoredProfile>(PROFILES_KEY);
  map[username] = profile;
  writeMap(PROFILES_KEY, map);
}

export async function login(username: string, password: string): Promise<User> {
  if (USE_MOCK) {
    await delay(400);
    if (!username.trim() || !password) {
      throw new Error("Username and password are required.");
    }
    if (!VALID_USERNAMES.includes(username)) {
      throw new Error("Unknown username. Use user01 – user13.");
    }
    if (password !== getStoredPassword(username)) {
      throw new Error("Incorrect password.");
    }
    const saved = getStoredProfile(username);
    return {
      id: username,
      name: username,
      email: username,
      interests: saved?.interests ?? [],
      cefrLevel: saved?.cefrLevel ?? null,
      assessedAt: saved?.assessedAt ?? null,
      createdAt: new Date().toISOString(),
    };
  }
  try {
    const { data } = await apiClient.post<LoginPayload>("/auth/login", {
      username,
      password,
    });
    if (data.access_token) {
      try {
        localStorage.setItem("leeswijs-token", data.access_token);
      } catch {
        // X-User-Id still supports the prototype flow if storage fails.
      }
    }

    return {
      id: data.user_id,
      name: data.display_name,
      email: data.username,
      interests: data.interests ?? [],
      cefrLevel: (data.estimated_cefr as CefrLevel) ?? null,
      assessedAt: data.assessed_at ?? null,
      createdAt: data.created_at ?? new Date().toISOString(),
    };
  } catch (err) {
    const detail =
      (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    throw new Error(detail ?? "Login failed.");
  }
}

export async function registerUser(
  name: string,
  email: string,
  password: string
): Promise<void> {
  if (USE_MOCK) {
    await delay(400);
    return;
  }
  const userIdBase = email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .slice(0, 30);
  const userId = `${userIdBase || "user"}_${Date.now()}`;
  await apiClient.post("/auth/signup", {
    user_id: userId,
    email,
    password,
    learning_purpose: `Registered as ${name.trim()}`,
  });
}

export async function saveProfile(user: User): Promise<void> {
  const profile = {
    interests: user.interests,
    cefrLevel: user.cefrLevel,
    assessedAt: user.assessedAt,
  };
  setStoredProfile(user.id, profile);

  if (USE_MOCK) {
    return;
  }
  try {
    await apiClient.put("/users/me/profile", {
      interests: user.interests,
      estimated_cefr: user.cefrLevel,
      assessed_at: user.assessedAt,
    });
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 404) {
      return;
    }
    throw new Error(apiErrorMessage(err, "Could not save profile."));
  }
}

export async function changePassword(
  username: string,
  oldPassword: string,
  newPassword: string
): Promise<void> {
  if (USE_MOCK) {
    await delay(300);
    if (oldPassword !== getStoredPassword(username)) {
      throw new Error("Current password is incorrect.");
    }
    if (newPassword.length < 4) {
      throw new Error("New password must be at least 4 characters.");
    }
    if (newPassword === oldPassword) {
      throw new Error("New password must differ from the current one.");
    }
    setStoredPassword(username, newPassword);
    return;
  }
  try {
    await apiClient.post("/auth/change-password", {
      old_password: oldPassword,
      new_password: newPassword,
    });
  } catch (err) {
    throw new Error(apiErrorMessage(err, "Could not change password."));
  }
}
