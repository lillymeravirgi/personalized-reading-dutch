import type { TextToken } from "../../types";

type Props = {
  tokens: TextToken[];
  onHighlightClick: (token: TextToken, el: HTMLElement) => void;
  onPlainWordClick: (word: string, el: HTMLElement) => void;
  activeWordId?: string | null;
  activePlainWord?: string | null;
  isLookupWord?: (word: string) => boolean;
};

export default function HighlightedText({
  tokens,
  onHighlightClick,
  onPlainWordClick,
  activeWordId,
  activePlainWord,
  isLookupWord,
}: Props) {
  return (
    <article className="font-body text-[17px] leading-[1.85] text-text whitespace-pre-wrap select-text">
      {tokens.map((token, i) => {
        if (token.type !== "word") {
          return <span key={i}>{token.text}</span>;
        }

        const canClick = isLookupWord ? isLookupWord(token.text) : true;
        const isHighlighted = !!token.status && canClick;
        const isActive = isHighlighted
          ? activeWordId === token.wordId
          : activePlainWord?.toLowerCase() === token.text.toLowerCase();

        if (isHighlighted) {
          const isNew = token.status === "new";
          const tone = isNew
            ? "border-blue-200/80 bg-blue-50 text-blue-800 hover:bg-blue-100"
            : "border-amber-200/80 bg-amber-50 text-amber-800 hover:bg-amber-100";

          const ring = isActive ? "ring-2 ring-primary/50" : "";

          return (
            <button
              key={i}
              type="button"
              onClick={(e) => onHighlightClick(token, e.currentTarget)}
              className={`
                word-token inline-flex items-center border px-[2px]
                transition-colors outline-none align-baseline
                ${tone} ${ring}
              `}
              style={{ 
                lineHeight: 1.08,
                verticalAlign: "baseline", 
                borderRadius: "3px",
                margin: "0 -1px",
              }}
            >
              {token.text}
            </button>
          );
        }

        const activeClass = isActive ? "bg-primary/10 text-primary ring-1 ring-primary/20" : "";

        if (!canClick) {
          return <span key={i}>{token.text}</span>;
        }
        
        return (
          <button
            key={i}
            type="button"
            onClick={(e) => onPlainWordClick(token.text, e.currentTarget)}
            className={`
              word-token inline-flex items-center rounded px-0.5 
              transition-colors outline-none align-baseline 
              hover:bg-black/5 ${activeClass}
            `}
            style={{ 
              lineHeight: 1.2, 
              verticalAlign: "baseline", 
              borderRadius: "4px",
              margin: "0 -1px",
            }}
          >
            {token.text}
          </button>
        );
      })}
    </article>
  );
}
