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
} from "../types";
import {
  mockUser,
  mockReadingSession,
  mockFlashcards,
  mockAssessmentBatches,
} from "../mocks/data";

// Axios instance
export const apiClient = axios.create({
  baseURL: "http://localhost:8000/api",
  timeout: 10_000,
  headers: { "Content-Type": "application/json" },
});

// Helpers
const delay = (ms = 300) => new Promise<void>((res) => setTimeout(res, ms));

function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

// Set USE_MOCK to false to hit the real FastAPI backend.
export const USE_MOCK = true;

// API functions

// Get the logged-in user's profile.
export async function getUser(): Promise<ApiResponse<User>> {
  if (USE_MOCK) {
    await delay();
    return ok(mockUser);
  }
  const { data } = await apiClient.get<ApiResponse<User>>("/user/me");
  return data;
}

// Fetch one reading session by id.
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

// Ask the backend to generate a fresh reading session and return its id.
// Backend uses int ids, we stringify at the boundary.
// Throws on failure so the caller can show an error.
type GenerateSessionPayload = {
  session_id: number;
  title: string;
  content: string;
  topic_used: string | null;
};

export async function generateSession(
  userId: string,
  condition: "ADAPTIVE" | "BASELINE" = "ADAPTIVE"
): Promise<{ sessionId: string }> {
  if (USE_MOCK) {
    await delay(600);
    return { sessionId: mockReadingSession.sessionId };
  }
  try {
    const { data } = await apiClient.post<GenerateSessionPayload>(
      "/session/generate",
      { user_id: userId, condition }
    );
    return { sessionId: String(data.session_id) };
  } catch (err) {
    const detail =
      (err as { response?: { data?: { detail?: string } } })?.response?.data
        ?.detail;
    throw new Error(detail ?? "Could not generate a new session.");
  }
}

// Get flashcards that are due today.
export async function getFlashcards(): Promise<ApiResponse<FlashcardItem[]>> {
  if (USE_MOCK) {
    await delay();
    return ok(mockFlashcards);
  }
  const { data } = await apiClient.get<ApiResponse<FlashcardItem[]>>("/flashcards");
  return data;
}

// Get one assessment batch (batchNumber is 1-indexed).
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

// Submit the assessment answers. Returns the estimated CEFR level.
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

// Activity log + condition helpers used by the Home dashboard.
// In mock mode this data lives in localStorage so Home and Reading History
// still have something real to show before these endpoints are connected.

export type SessionLogEntry = {
  sessionId: string;
  title: string;
  topic: string;
  cefrLevel: string;
  isAdaptive: boolean;
  /** ISO timestamp of when the session was generated. */
  createdAt: string;
  /** Accumulated reading dwell in ms (may update as user re-opens). */
  dwellMs: number;
};

export type Activity = {
  sessions: SessionLogEntry[];
  wordsLookedUp: number;
  flashcardsRemembered: number;
  flashcardsForgot: number;
  /** Map of "YYYY-MM-DD" -> minutes read that day (local time). */
  dailyMinutes: Record<string, number>;
};

const ACTIVITY_KEY_PREFIX = "leeswijs-activity-";
const CONDITION_KEY       = "leeswijs-condition";

function emptyActivity(): Activity {
  return {
    sessions: [],
    wordsLookedUp: 0,
    flashcardsRemembered: 0,
    flashcardsForgot: 0,
    dailyMinutes: {},
  };
}

export function readActivity(username: string): Activity {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY_PREFIX + username);
    if (!raw) return emptyActivity();
    const parsed = JSON.parse(raw) as Partial<Activity>;
    return { ...emptyActivity(), ...parsed };
  } catch {
    return emptyActivity();
  }
}

function writeActivity(username: string, a: Activity): void {
  try {
    localStorage.setItem(ACTIVITY_KEY_PREFIX + username, JSON.stringify(a));
  } catch {
    // ignore (quota / private mode)
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
  // Avoid duplicates when the same session loads twice.
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
  if (ms <= 0) return;
  const a = readActivity(username);
  const idx = a.sessions.findIndex((s) => s.sessionId === sessionId);
  if (idx >= 0) a.sessions[idx].dwellMs += ms;
  const key = todayKey();
  a.dailyMinutes[key] = (a.dailyMinutes[key] ?? 0) + ms / 60_000;
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

// Wipe a user's local progress so they run onboarding again on next login.
export function resetLocalData(username: string): void {
  try {
    localStorage.removeItem(ACTIVITY_KEY_PREFIX + username);
    // Also clear their saved profile + password so the next login runs
    // the new-user flow again. Keep other users' data intact.
    const pw = readMap<string>(PASSWORDS_KEY);
    delete pw[username];
    writeMap(PASSWORDS_KEY, pw);
    const pf = readMap<StoredProfile>(PROFILES_KEY);
    delete pf[username];
    writeMap(PROFILES_KEY, pf);
  } catch {
    // noop
  }
}

// Experiment condition toggle
export type Condition = "ADAPTIVE" | "BASELINE";

export function getCondition(): Condition {
  const v = (() => {
    try { return localStorage.getItem(CONDITION_KEY); }
    catch { return null; }
  })();
  return v === "BASELINE" ? "BASELINE" : "ADAPTIVE";
}

export function setCondition(c: Condition): void {
  try { localStorage.setItem(CONDITION_KEY, c); } catch { /* noop */ }
}

// Mini dictionary for non-highlighted words in Reading.
// In mock mode this covers the common words in the seeded sample article.
// In real mode `GET /api/lexicon/define/{word}` provides the translation.
const MOCK_DICT: Record<string, string> = {
  de: "the", het: "the / it", een: "a / an", van: "of / from", en: "and",
  is: "is", zijn: "are / to be", niet: "not", nog: "still / yet", maar: "but",
  ook: "also", op: "on", in: "in", tot: "until / to", naar: "to",
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

// Look up a word's English translation. Used by Reading when the user
// clicks a non-highlighted word. Returns null when not in the dictionary.
export async function defineWord(word: string): Promise<string | null> {
  const key = word.trim().toLowerCase();
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

// Auto-add a word to the flashcard deck after the user looks it up on
// Reading. Mock mode does nothing; real mode hits PATCH /api/vocab/add-to-learn.
export async function addToLearn(
  word: string,
  english: string | null
): Promise<void> {
  if (USE_MOCK) {
    await delay(100);
    return;
  }
  try {
    await apiClient.patch("/vocab/add-to-learn", { word, english });
  } catch {
    // Swallow: non-critical, user already got the translation.
  }
}

// Log one word interaction (see examples / add to learn / ignore).
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

// Submit the survey a user filled out after a reading session.
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

// Auth
type LoginPayload = {
  user_id: string;
  username: string;
  display_name: string;
  estimated_cefr: string | null;
};

// Seeded participants (see backend/seed.py): user01 .. user13
const VALID_USERNAMES = Array.from({ length: 13 }, (_, i) =>
  `user${String(i + 1).padStart(2, "0")}`
);

// localStorage keys used for per-user data in mock mode.
// `leeswijs-passwords` : { [username]: currentPassword }
// `leeswijs-profiles`  : { [username]: { interests, cefrLevel } }
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
    // noop – private mode etc.
  }
}

function getStoredPassword(username: string): string {
  // Default password == username (matches backend/seed.py).
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

// Log in with username + password.
// Mock mode: only user01 – user13 work. Password is the localStorage
// override, and if not set, it equals the username (backend seed default).
// Returning users get their saved interests + CEFR back; first-timers
// start empty so the app routes them through onboarding and assessment.
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

    return {
      id: data.user_id,
      name: data.display_name,
      email: data.username,
      interests: [],
      cefrLevel: (data.estimated_cefr as CefrLevel) ?? null,
      assessedAt: null,
      createdAt: new Date().toISOString(),
    };
  } catch (err) {
    const detail =
      (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    throw new Error(detail ?? "Login failed.");
  }
}

// Save the user's interests + CEFR so logout-then-login does not re-ask.
// In mock mode this stays in localStorage. A real user profile endpoint can
// take over later without changing the calling code.
export async function saveProfile(user: User): Promise<void> {
  if (USE_MOCK) {
    setStoredProfile(user.id, {
      interests: user.interests,
      cefrLevel: user.cefrLevel,
      assessedAt: user.assessedAt,
    });
    return;
  }
  // Real backend persistence can be added here when the profile route is ready.
}

// Change the current user's password. Mock mode saves the new password
// per-username in localStorage so the next login needs the new one.
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
    const detail =
      (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
    throw new Error(detail ?? "Could not change password.");
  }
}
