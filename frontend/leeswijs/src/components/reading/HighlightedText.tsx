import { useMemo } from "react";
import type { HighlightedWord } from "../../types";

type Props = {
  text: string;
  highlights: HighlightedWord[];
  // Called when a highlighted (blue/yellow) word is clicked.
  // This feeds the 3-intent log: see_examples / add_to_learn / ignore.
  onHighlightClick: (wordId: string) => void;
  // Called when any non-highlighted word is clicked.
  // Used for the quick-lookup tooltip + auto-add to flashcards.
  onPlainWordClick: (word: string, el: HTMLElement) => void;
  activeWordId?: string | null;
  // The non-highlighted word the tooltip is currently showing, so we can
  // draw a ring around it.
  activePlainWord?: string | null;
};

type Segment =
  | { kind: "plain"; text: string }
  | { kind: "highlight"; text: string; word: HighlightedWord };

type Token =
  | { kind: "word"; text: string }
  | { kind: "gap"; text: string };

// Walk the text linearly, emitting plain segments between non-overlapping
// highlights so React renders stable keys and the DOM stays flat.
function buildSegments(text: string, highlights: HighlightedWord[]): Segment[] {
  const sorted = [...highlights].sort((a, b) => a.startIndex - b.startIndex);
  const segments: Segment[] = [];
  let cursor = 0;
  for (const h of sorted) {
    if (h.startIndex < cursor) continue;
    if (h.startIndex > cursor) {
      segments.push({ kind: "plain", text: text.slice(cursor, h.startIndex) });
    }
    segments.push({
      kind: "highlight",
      text: text.slice(h.startIndex, h.endIndex),
      word: h,
    });
    cursor = h.endIndex;
  }
  if (cursor < text.length) {
    segments.push({ kind: "plain", text: text.slice(cursor) });
  }
  return segments;
}

// Split a plain segment into words (clickable) and "gaps" (whitespace /
// punctuation). Uses unicode letter class so Dutch diacritics (ë, ü, …)
// stay attached to their word.
function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  const re = /[\p{L}][\p{L}'-]*|[^\p{L}]+/gu;
  for (const m of text.matchAll(re)) {
    const t = m[0];
    if (/^\p{L}/u.test(t)) tokens.push({ kind: "word", text: t });
    else tokens.push({ kind: "gap", text: t });
  }
  return tokens;
}

export default function HighlightedText({
  text,
  highlights,
  onHighlightClick,
  onPlainWordClick,
  activeWordId,
  activePlainWord,
}: Props) {
  const segments = useMemo(() => buildSegments(text, highlights), [text, highlights]);

  return (
    <article className="font-body text-[17px] leading-[1.85] text-text whitespace-pre-wrap">
      {segments.map((seg, i) => {
        // Highlighted word (yellow/blue) — keeps the full WordModal flow.
        if (seg.kind === "highlight") {
          const isUnknown = seg.word.highlightType === "unknown";
          const isActive = activeWordId === seg.word.wordId;
          const tone = isUnknown
            ? "bg-blue-100 text-blue-900 hover:bg-blue-200"
            : "bg-yellow-100 text-yellow-900 hover:bg-yellow-200";
          const ring = isActive ? "ring-2 ring-primary/50" : "";
          return (
            <button
              key={i}
              type="button"
              onClick={() => onHighlightClick(seg.word.wordId)}
              className={`rounded-md px-0.5 py-0.5 cursor-pointer transition-colors outline-none ${tone} ${ring}`}
              aria-label={`Look up ${seg.word.dutch}`}
            >
              {seg.text}
            </button>
          );
        }

        // Plain segment — split further so every word becomes clickable.
        const tokens = tokenize(seg.text);
        return (
          <span key={i}>
            {tokens.map((tok, j) => {
              if (tok.kind === "gap") return <span key={j}>{tok.text}</span>;
              const isActivePlain =
                activePlainWord !== null &&
                activePlainWord !== undefined &&
                activePlainWord.toLowerCase() === tok.text.toLowerCase();
              return (
                <button
                  key={j}
                  type="button"
                  onClick={(e) =>
                    onPlainWordClick(tok.text, e.currentTarget)
                  }
                  className={[
                    "rounded cursor-pointer transition-colors outline-none",
                    "hover:bg-black/[0.06]",
                    isActivePlain ? "bg-primary/10 ring-1 ring-primary/40" : "",
                  ].join(" ")}
                  aria-label={`Look up ${tok.text}`}
                >
                  {tok.text}
                </button>
              );
            })}
          </span>
        );
      })}
    </article>
  );
}
