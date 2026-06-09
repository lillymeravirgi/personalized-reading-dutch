import axios from "axios";

const baseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ??
  "http://localhost:8000/api";

export const apiClient = axios.create({
  baseURL: baseUrl,
  headers: { "Content-Type": "application/json" },
  timeout: 30_000,
});

export const readingGenerationTimeoutMs = 120_000;

apiClient.interceptors.request.use((config) => {
  const raw = localStorage.getItem("leeswijs-store");
  if (!raw) return config;

  try {
    const parsed = JSON.parse(raw) as { state?: { user?: { id?: string } } };
    const userId = parsed.state?.user?.id;
    if (userId) config.headers["X-User-Id"] = userId;
  } catch {
    return config;
  }

  return config;
});

export function extractError(err: unknown): string {
  if (axios.isAxiosError(err)) {
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
