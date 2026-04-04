import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useLocation, useNavigate, Navigate } from 'react-router-dom';
import { api } from '../api/client';
import './InteractiveReader.css';

// ── Tokenise the story content ────────────────────────────────────────────────
// Returns tokens: {type: 'BLUE'|'YELLOW'|'PLAIN'|'WS', text, word}
function tokenise(content, blueSet, yellowSet) {
  const tokens = [];
  const re = /\[\[([^\]]+)\]\]|(\w+)|([^\w]+)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    if (m[1]) {
      const w = m[1].toLowerCase();
      const type = blueSet.has(w) ? 'BLUE' : yellowSet.has(w) ? 'YELLOW' : 'PLAIN';
      tokens.push({ type, text: m[1], word: w });
    } else if (m[2]) {
      const w = m[2].toLowerCase();
      const type = blueSet.has(w) ? 'BLUE' : yellowSet.has(w) ? 'YELLOW' : 'PLAIN';
      tokens.push({ type, text: m[2], word: w });
    } else {
      tokens.push({ type: 'WS', text: m[3] });
    }
  }
  return tokens;
}

// ── Tooltip ────────────────────────────────────────────────────────────────────
function Tooltip({ entry, position, onTelemetry, onAddToLearn, onClose, isLoading }) {
  return (
    <div className="tooltip-overlay" onClick={onClose}>
      <div
        className="tooltip-card"
        style={{ top: position.y, left: position.x }}
        onClick={e => e.stopPropagation()}
      >
        {isLoading ? (
          <div className="tooltip-loading">
            <div className="tooltip-spinner" />
            <span>Zoeken…</span>
          </div>
        ) : entry ? (
          <>
            <div className="tooltip-header">
              <span className="tooltip-word">{entry.word}</span>
              <span className="tooltip-cefr">{entry.cefr_level}</span>
            </div>
            <div className="tooltip-translation">{entry.translation}</div>
            {entry.examples && entry.examples.length > 0 && (
              <div className="tooltip-examples">
                {entry.examples.slice(0, 2).map((ex, i) => (
                  <div key={i} className="tooltip-example">
                    <div className="ex-nl">{ex.nl}</div>
                    <div className="ex-en">{ex.en}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="tooltip-actions">
              <button
                className="tt-btn see-examples"
                id={`tt-see-${entry.word}`}
                onClick={() => onTelemetry('DEEP_PROCESSING', 5)}
              >
                📖 See Examples
              </button>
              <button
                className="tt-btn add-learn"
                id={`tt-add-${entry.word}`}
                onClick={() => onAddToLearn(entry)}
              >
                ✚ Add to Learn
              </button>
              <button
                className="tt-btn ignore"
                id={`tt-ignore-${entry.word}`}
                onClick={() => onTelemetry('WORD_AVOIDANCE', 1)}
              >
                ✕ Ignore
              </button>
            </div>
          </>
        ) : (
          <div className="tooltip-error">Definitie niet gevonden.</div>
        )}
      </div>
    </div>
  );
}

// ── Interactive Reader Page ────────────────────────────────────────────────────
export default function InteractiveReader({ userId: userIdProp }) {
  const { sessionId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // userId: prefer prop (from App state), fallback to navigate state
  const userId = userIdProp || location.state?.userId || null;

  const [session, setSession]           = useState(location.state?.session || null);
  const [loading, setLoading]           = useState(!location.state?.session);
  const [error, setError]               = useState(null);
  const [blueSet, setBlueSet]           = useState(new Set());
  const [yellowSet, setYellowSet]       = useState(new Set());
  const [wordMap, setWordMap]           = useState({});
  const [tooltip, setTooltip]           = useState(null);
  const [tooltipLoading, setTooltipLoading] = useState(false);

  // ── Build Blue / Yellow sets from session data ─────────────────────────────
  const buildWordSets = useCallback((s) => {
    const bSet = new Set((s.blue_words  || []).map(w => w.word.toLowerCase()));
    const ySet = new Set((s.yellow_words || []).map(w => w.word.toLowerCase()));
    setBlueSet(bSet);
    setYellowSet(ySet);
    const map = {};
    [...(s.blue_words || []), ...(s.yellow_words || [])].forEach(w => {
      map[w.word.toLowerCase()] = w;
    });
    setWordMap(map);
    setLoading(false);
  }, []);

  // ── Load session (only when not passed via navigate state) ────────────────
  useEffect(() => {
    if (session) {
      buildWordSets(session);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        // api is a stable module-level object, safe to omit from deps
        // eslint-disable-next-line react-hooks/exhaustive-deps
        const data = await api.getSession(sessionId, userId);
        if (!cancelled) {
          setSession(data);
          buildWordSets(data);
        }
      } catch {
        if (!cancelled) setError('Sessie kon niet worden geladen.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [sessionId, userId, buildWordSets]); // session intentionally omitted — only run once per sessionId

  // ── Word click → tooltip ───────────────────────────────────────────────────
  const handleWordClick = useCallback(async (word, event) => {
    const rect = event.target.getBoundingClientRect();
    const x = Math.min(rect.left + window.scrollX, window.innerWidth - 340);
    const y = rect.bottom + window.scrollY + 8;

    const cached = wordMap[word];
    if (cached) {
      setTooltip({ entry: cached, position: { x, y }, word });
      return;
    }

    setTooltip({ entry: null, position: { x, y }, word });
    setTooltipLoading(true);
    try {
      const entry = await api.defineWord(word);
      setWordMap(prev => ({ ...prev, [word]: entry }));
      setTooltip({ entry, position: { x, y }, word });
    } catch {
      setTooltip({ entry: null, position: { x, y }, word });
    } finally {
      setTooltipLoading(false);
    }
  }, [wordMap]);

  // ── Telemetry log ──────────────────────────────────────────────────────────
  const handleTelemetry = useCallback(async (intentTag, weight) => {
    if (!tooltip || !session) return;
    const entry = wordMap[tooltip.word];
    if (!entry?.word_id) return;
    try {
      await api.logTelemetry({
        session_id: session.session_id,
        word_id: entry.word_id,
        intent_tag: intentTag,
        engagement_weight: weight,
      });
    } catch (e) {
      console.warn('Telemetry failed (non-critical):', e.message);
    }
    if (intentTag !== 'DEEP_PROCESSING') setTooltip(null);
  }, [tooltip, session, wordMap]);

  // ── Add to learn → promote Blue → Yellow ──────────────────────────────────
  const handleAddToLearn = useCallback(async (entry) => {
    try {
      await api.addToLearn({ user_id: userId, word_id: entry.word_id });
      await api.logTelemetry({
        session_id: session.session_id,
        word_id: entry.word_id,
        intent_tag: 'ACQUISITION_INTENT',
        engagement_weight: 3,
      });
      // Promote locally: Blue → Yellow, no page reload
      setYellowSet(prev => new Set([...prev, entry.word.toLowerCase()]));
      setBlueSet(prev => {
        const s = new Set(prev);
        s.delete(entry.word.toLowerCase());
        return s;
      });
    } catch (e) {
      console.warn('Add to learn failed:', e.message);
    }
    setTooltip(null);
  }, [userId, session, wordMap]);   // eslint-disable-line react-hooks/exhaustive-deps

  // ── Guard: no user → redirect to landing (after all hooks) ─────────────────
  if (!userId) return <Navigate to="/" replace />;

  // ── Render ────────────────────────────────────────────────────────────────
  const tokens = session ? tokenise(session.content, blueSet, yellowSet) : [];

  if (loading) return (
    <div className="reader-loading">
      <div className="reader-spinner" />
      <p>Laden van het verhaal…</p>
    </div>
  );

  if (error) return (
    <div className="reader-error">
      <p>{error}</p>
      <button onClick={() => navigate('/')}>← Terug naar home</button>
    </div>
  );

  if (!session) return (
    <div className="reader-error">
      <p>Geen sessie gevonden.</p>
      <button onClick={() => navigate('/')}>← Terug naar home</button>
    </div>
  );

  return (
    <div className="reader-page">
      {tooltip && (
        <Tooltip
          entry={tooltip.entry}
          position={tooltip.position}
          onTelemetry={handleTelemetry}
          onAddToLearn={handleAddToLearn}
          onClose={() => setTooltip(null)}
          isLoading={tooltipLoading}
        />
      )}

      <div className="reader-header">
        <button className="reader-back" onClick={() => navigate('/')}>← Home</button>
        <div className="reader-legend">
          <span className="legend-blue">■ Nieuw (Blauw)</span>
          <span className="legend-yellow">■ Aan het leren (Geel)</span>
          <span className="legend-plain">Klik op een woord voor uitleg</span>
        </div>
      </div>

      <article className="reader-article">
        <div className="reader-topic">{session.topic_used}</div>
        <h1 className="reader-title">{session.title || `Sessie #${session.session_id}`}</h1>
        <div className="reader-body">
          {tokens.map((tok, i) => {
            if (tok.type === 'WS') return <span key={i}>{tok.text}</span>;
            return (
              <span
                key={i}
                className={`word word-${tok.type.toLowerCase()}`}
                onClick={e => handleWordClick(tok.word, e)}
                role="button"
                tabIndex={0}
                id={`word-${i}`}
              >
                {tok.text}
              </span>
            );
          })}
        </div>
      </article>
    </div>
  );
}
