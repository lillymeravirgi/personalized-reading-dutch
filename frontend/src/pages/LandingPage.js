import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import './LandingPage.css';

const NARRATIVE_STYLES = ['Storytelling', 'News Article', 'Horror', 'Comedy', 'Dialogue'];

export default function LandingPage({ onUserSelect }) {
  const navigate = useNavigate();

  const [users, setUsers]         = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [topic, setTopic]         = useState('');
  const [style, setStyle]         = useState('Storytelling');
  const [generating, setGenerating] = useState(false);
  const [error, setError]         = useState(null);
  const [loadingUsers, setLoadingUsers] = useState(true);

  console.log("Rendering LandingPage, users:", users);

  // ── Load users from backend on mount ─────────────────────────────────────
  useEffect(() => {
    api.listUsers()
      .then(data => {
        setUsers(data);
        if (data.length > 0) setSelectedUser(data[0]);
      })
      .catch(() => setError('Could not load users from backend. Is the server running?'))
      .finally(() => setLoadingUsers(false));
  }, []);

  // ── Generate story ────────────────────────────────────────────────────────
  const handleGenerate = useCallback(async () => {
    if (!selectedUser) return;
    setGenerating(true);
    setError(null);
    try {
      const payload = {
        user_id: selectedUser.user_id,
        K: 0.7,
        narrative_style: style,
        word_count_range: '150-200',
        condition: 'ADAPTIVE',
        ...(topic.trim() ? { topic: topic.trim() } : {}),
      };
      const result = await api.generateSession(payload);
      // Save chosen user into app-level state
      onUserSelect(selectedUser.user_id);
      // Navigate straight to the reader
      navigate(`/read/${result.session_id}`, {
        state: { session: result, userId: selectedUser.user_id },
      });
    } catch (e) {
      setError(e?.response?.data?.detail || 'Story generation failed. Check the backend logs.');
      setGenerating(false);
    }
  }, [selectedUser, topic, style, navigate, onUserSelect]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !generating) handleGenerate();
  };

  if (loadingUsers) {
    return (
      <div className="landing-page">
        <div className="landing-panel">Laden...</div>
      </div>
    );
  }

  return (
    <div className="landing-page">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="landing-hero">
        <div className="landing-flag">🇳🇱</div>
        <h1 className="landing-title">Dutch Adaptive Storyteller</h1>
        <p className="landing-subtitle">
          Select a learner, choose a topic, and let AI craft a personalised Dutch reading text
          — with <span className="blue-label">new</span> and <span className="yellow-label">learning</span> vocabulary highlighted automatically.
        </p>
      </div>

      {/* ── Control Panel ─────────────────────────────────────────────────── */}
      <div className="landing-panel">

        {/* User Selector */}
        <div className="control-group">
          <label className="control-label" htmlFor="user-select">
            👤 Learner Profile
          </label>
          {loadingUsers ? (
            <div className="control-skeleton" />
          ) : (
            <select
              id="user-select"
              className="control-select"
              value={selectedUser?.user_id || ''}
              onChange={e => {
                const u = users.find(u => u.user_id === e.target.value);
                setSelectedUser(u || null);
              }}
            >
              {users && users.length > 0 && users.map(u => (
                <option key={u.user_id} value={u.user_id}>
                  {u.display_name} — {u.cefr} · {u.purpose} · {u.location}
                </option>
              ))}
            </select>
          )}
          {selectedUser && (
            <div className="user-badge">
              <span className={`cefr-pill cefr-${selectedUser.cefr?.toLowerCase()}`}>
                {selectedUser.cefr}
              </span>
              <span className="user-purpose">{selectedUser.purpose}</span>
              <span className="user-location">📍 {selectedUser.location}</span>
            </div>
          )}
        </div>

        {/* Topic Input */}
        <div className="control-group">
          <label className="control-label" htmlFor="topic-input">
            📝 Topic <span className="control-hint">(leave blank for AI to choose)</span>
          </label>
          <input
            id="topic-input"
            type="text"
            className="control-input"
            placeholder="e.g. Moving to Maastricht, Buying a bike, Treinen in Rotterdam…"
            value={topic}
            onChange={e => setTopic(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={generating}
          />
        </div>

        {/* Narrative Style */}
        <div className="control-group">
          <label className="control-label" htmlFor="style-select">
            🎭 Narrative Style
          </label>
          <div className="style-pills">
            {NARRATIVE_STYLES.map(s => (
              <button
                key={s}
                className={`style-pill ${style === s ? 'style-pill--active' : ''}`}
                onClick={() => setStyle(s)}
                disabled={generating}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && <div className="landing-error">⚠ {error}</div>}

        {/* Generate Button */}
        <button
          id="generate-story-btn"
          className={`landing-generate-btn ${generating ? 'landing-generate-btn--loading' : ''}`}
          onClick={handleGenerate}
          disabled={generating || !selectedUser}
        >
          {generating ? (
            <>
              <span className="btn-spinner" />
              Generating your story…
            </>
          ) : (
            '✦ Generate Story'
          )}
        </button>

        <p className="landing-footer-hint">
          Story generation takes ~10–20 seconds · Powered by Gemini
        </p>
      </div>
    </div>
  );
}
