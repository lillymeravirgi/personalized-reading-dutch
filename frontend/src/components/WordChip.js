import React from 'react';

/**
 * WordChip — renders an inline highlighted word.
 * color: 'blue' | 'yellow' | 'none'
 */
export default function WordChip({ word, color = 'none', onClick }) {
  return (
    <span
      className={`word-chip ${color}`}
      onClick={() => onClick && onClick()}
      title={color !== 'none' ? `Click to explore "${word}"` : undefined}
    >
      {word}
    </span>
  );
}
