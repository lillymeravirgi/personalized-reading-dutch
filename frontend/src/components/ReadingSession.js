import React, { useState, useCallback } from 'react';
import WordChip from './WordChip';
import Tooltip from './Tooltip';
import { getWord } from '../api/client';

/**
 * ReadingSession — renders the story content with highlighted words.
 *
 * Props:
 *   content     — raw string with [[word]] markup
 *   blueWords   — array of {word_id, word, ...} (Blue = recommended)
 *   yellowWords — array of {word_id, word, ...} (Yellow = LEARNING)
 *   sessionId   — current session id
 *   userId      — current user id
 *   onToast     — callback(msg) for notifications
 */
export default function ReadingSession({ content, blueWords, yellowWords, sessionId, userId, onToast }) {
  const [activeTooltip, setActiveTooltip] = useState(null); // {word, color, anchorRect}

  // Build lookup maps: lowercase word string → {color, ...wordInfo}
  const blueMap  = Object.fromEntries((blueWords  || []).map(w => [w.word.toLowerCase(), { ...w, color: 'blue' }]));
  const yellowMap = Object.fromEntries((yellowWords || []).map(w => [w.word.toLowerCase(), { ...w, color: 'yellow' }]));

  const handleChipClick = useCallback(async (rawWord, color, wordEntry, e) => {
    const rect = e.target.getBoundingClientRect();
    // Fetch full lexicon entry (includes examples, use_cases)
    let fullEntry = wordEntry;
    try {
      fullEntry = await getWord(wordEntry.word_id);
    } catch (_) {}
    setActiveTooltip({ word: fullEntry, color, anchorRect: rect });
  }, []);

  // Parse content: split on [[...]] tokens
  const tokens = content.split(/(\[\[.*?\]\])/g);

  const nodes = tokens.map((token, i) => {
    const match = token.match(/^\[\[(.+?)\]\]$/);
    if (!match) {
      return <React.Fragment key={i}>{token}</React.Fragment>;
    }

    const rawWord = match[1];
    const key = rawWord.toLowerCase();
    const blueEntry   = blueMap[key];
    const yellowEntry = yellowMap[key];
    const entry       = blueEntry || yellowEntry;
    const color       = blueEntry ? 'blue' : yellowEntry ? 'yellow' : 'none';

    if (!entry) {
      // Word is in [[brackets]] but not in our word lists — render plain
      return <React.Fragment key={i}>{rawWord}</React.Fragment>;
    }

    return (
      <WordChip
        key={i}
        word={rawWord}
        color={color}
        onClick={(e) => {
          // e is a synthetic event from the chip click
          // We need to get the actual DOM event; WordChip passes the SyntheticEvent via onClick
          handleChipClick(rawWord, color, entry, e);
        }}
      />
    );
  });

  return (
    <div className="story-body">
      {nodes}

      {activeTooltip && (
        <Tooltip
          word={activeTooltip.word}
          color={activeTooltip.color}
          sessionId={sessionId}
          userId={userId}
          anchorRect={activeTooltip.anchorRect}
          onClose={() => setActiveTooltip(null)}
          onToast={onToast}
        />
      )}
    </div>
  );
}
