import React, { useEffect, useRef } from 'react';
import { addToLearn, logTelemetry } from '../api/client';

/**
 * Tooltip — floating panel for a clicked word.
 * Props:
 *   word       — full lexicon entry {word_id, word, translation, cefr_level, examples, use_cases}
 *   color      — 'blue' | 'yellow'
 *   sessionId  — current reading_session id
 *   userId     — current user id
 *   anchorRect — DOMRect of the clicked chip
 *   onClose    — callback
 *   onToast    — callback(msg) for success notifications
 */
export default function Tooltip({ word, color, sessionId, userId, anchorRect, onClose, onToast }) {
  const ref = useRef(null);

  // Position the tooltip near the clicked word
  useEffect(() => {
    if (!ref.current || !anchorRect) return;
    const el = ref.current;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tipW = el.offsetWidth;
    const tipH = el.offsetHeight;

    let top = anchorRect.bottom + 8;
    let left = anchorRect.left;

    if (left + tipW > vw - 16) left = vw - tipW - 16;
    if (left < 16) left = 16;
    if (top + tipH > vh - 16) top = anchorRect.top - tipH - 8;

    el.style.top  = `${top}px`;
    el.style.left = `${left}px`;
  }, [anchorRect]);

  const log = async (intent_tag, engagement_weight) => {
    try {
      await logTelemetry({ session_id: sessionId, word_id: word.word_id, intent_tag, engagement_weight });
    } catch (e) {
      console.error('Telemetry error:', e);
    }
  };

  const handleSeeExamples = async () => {
    await log('DEEP_PROCESSING', 5);
    onToast?.('Logged: Deep Processing (×5)');
  };

  const handleAddToLearn = async () => {
    await addToLearn(userId, word.word_id);
    await log('ACQUISITION_INTENT', 3);
    onToast?.(`"${word.word}" added to your learning list!`);
    onClose();
  };

  const handleIgnore = async () => {
    await log('WORD_AVOIDANCE', 1);
    onToast?.('Word dismissed.');
    onClose();
  };

  const examples = Array.isArray(word.examples) ? word.examples.slice(0, 2) : [];

  return (
    <>
      {/* invisible overlay to catch outside clicks */}
      <div className="tooltip-overlay" onClick={onClose} />

      <div className="tooltip" ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="tooltip-header">
          <span className={`tooltip-word ${color}`}>{word.word}</span>
          <span className="tooltip-cefr">{word.cefr_level}</span>
        </div>

        <div className="tooltip-translation">"{word.translation}"</div>

        {examples.length > 0 && (
          <div className="tooltip-examples">
            <div className="tooltip-examples-title">Examples</div>
            {examples.map((ex, i) => (
              <div className="tooltip-example" key={i}>
                <div className="tooltip-example-nl">{ex.nl}</div>
                <div className="tooltip-example-en">{ex.en}</div>
              </div>
            ))}
          </div>
        )}

        <div className="tooltip-actions">
          <button id={`btn-examples-${word.word_id}`} className="tooltip-btn examples" onClick={handleSeeExamples}>
            📖 See Examples
          </button>
          {color === 'blue' && (
            <button id={`btn-learn-${word.word_id}`} className="tooltip-btn learn" onClick={handleAddToLearn}>
              ➕ Add to Learn
            </button>
          )}
          <button id={`btn-ignore-${word.word_id}`} className="tooltip-btn ignore" onClick={handleIgnore}>
            ✕ Ignore
          </button>
          <button className="tooltip-btn close" onClick={onClose}>Close</button>
        </div>
      </div>
    </>
  );
}
