import { TextToken } from "../../types";

type Props = {
  tokens: TextToken[];
  onHighlightClick: (wordId: string, el: HTMLElement) => void;
  onPlainWordClick: (word: string, el: HTMLElement) => void;
  activeWordId?: string | null;
  activePlainWord?: string | null;
};

export default function HighlightedText({
  tokens,
  onHighlightClick,
  onPlainWordClick,
  activeWordId,
  activePlainWord,
}: Props) {
  return (
    <article className="font-body text-[17px] leading-[1.85] text-text whitespace-pre-wrap select-text">
      {tokens.map((token, i) => {
        if (token.type !== "word") {
          return <span key={i}>{token.text}</span>;
        }

        const isHighlighted = !!token.status;
        const isActive = isHighlighted
          ? activeWordId === token.wordId
          : activePlainWord?.toLowerCase() === token.text.toLowerCase();

        // ── Highlighted Word (Blue/Yellow) ──────────────────────────
        if (isHighlighted) {
          const isNew = token.status === "new";
          const tone = isNew
            ? "bg-blue-100 text-blue-900 hover:bg-blue-200"
            : "bg-yellow-100 text-yellow-900 hover:bg-yellow-200";
          
          const ring = isActive ? "ring-2 ring-primary/50" : "";

          return (
            <button
              key={i}
              type="button"
              onClick={(e) => onHighlightClick(token.wordId!, e.currentTarget)}
              className={`
                word-token inline-flex items-center rounded px-0.5 
                transition-colors outline-none align-baseline
                ${tone} ${ring}
              `}
              style={{ 
                lineHeight: 1.2, 
                verticalAlign: "baseline", 
                borderRadius: "4px",
                margin: "0 -1px", // Slight negative margin to keep words close
              }}
            >
              {token.text}
            </button>
          );
        }

        // ── Plain Word (White) ──────────────────────────────────────
        const activeClass = isActive ? "bg-primary/10 text-primary ring-1 ring-primary/20" : "";
        
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
