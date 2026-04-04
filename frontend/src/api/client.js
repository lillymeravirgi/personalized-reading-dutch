import axios from 'axios';

const BASE = 'http://127.0.0.1:8000';

const http = axios.create({
  baseURL: BASE,
  headers: { 'Content-Type': 'application/json' },
});

export const api = {
  // ── Users ────────────────────────────────────
  listUsers: () =>
    http.get('/users').then(r => r.data),

  // ── Sessions ────────────────────────────────
  generateSession: (body) =>
    http.post('/session/generate', body).then(r => r.data),

  listSessions: (userId) =>
    http.get('/session/list', { params: { user_id: userId } }).then(r => r.data),

  getSession: (sessionId, userId) =>
    http.get(`/session/${sessionId}`, { params: { user_id: userId } }).then(r => r.data),

  // ── Lexicon ─────────────────────────────────
  getWord: (wordId) =>
    http.get(`/lexicon/word/${wordId}`).then(r => r.data),

  defineWord: (word) =>
    http.get(`/lexicon/define/${encodeURIComponent(word)}`).then(r => r.data),

  // ── Telemetry ────────────────────────────────
  logTelemetry: (body) =>
    http.post('/telemetry/log', body).then(r => r.data),

  // ── Vocabulary ───────────────────────────────
  addToLearn: (body) =>
    http.patch('/vocab/add-to-learn', body).then(r => r.data),

  // ── KRS ──────────────────────────────────────
  runKrs: (userId) =>
    http.post(`/krs/run/${userId}`).then(r => r.data),
};
