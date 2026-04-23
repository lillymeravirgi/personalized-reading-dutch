import { Outlet } from "react-router-dom";

// Wrapper for pages without auth: login, onboarding, assessment.
// Shows the LeesWijs wordmark on a decorative background.
export default function AuthLayout() {
  return (
    <div className="relative min-h-screen bg-background flex flex-col items-center justify-center px-4 overflow-hidden">
      {/* Decorative background */}
      <DecorativeBackground />

      {/* Wordmark */}
      <div className="relative z-10 mb-8 text-center select-none">
        <div className="flex items-center justify-center gap-2 mb-1">
          {/* Book icon (pure SVG, no dependency) */}
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-primary"
          >
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
          </svg>
          <span className="font-heading text-4xl font-bold text-primary tracking-tight">
            Lees
          </span>
          <span className="font-heading text-4xl font-bold text-secondary tracking-tight">
            Wijs
          </span>
        </div>
        <p className="text-sm text-text/50 font-body">
          Personalized Dutch reading, adapted to you
        </p>
      </div>

      {/* Card */}
      <div className="relative z-10 w-full max-w-md">
        <Outlet />
      </div>
    </div>
  );
}

// Background decoration
function DecorativeBackground() {
  return (
    <>
      {/* Large blurred teal blob — top-left */}
      <div
        className="pointer-events-none absolute -top-32 -left-32 w-96 h-96 rounded-full opacity-20"
        style={{
          background: "radial-gradient(circle, #0D7377 0%, transparent 70%)",
          filter: "blur(40px)",
        }}
      />
      {/* Large blurred amber blob — bottom-right */}
      <div
        className="pointer-events-none absolute -bottom-24 -right-24 w-80 h-80 rounded-full opacity-15"
        style={{
          background: "radial-gradient(circle, #F2A541 0%, transparent 70%)",
          filter: "blur(48px)",
        }}
      />
      {/* Subtle dot grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "radial-gradient(circle, #1C1917 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      {/* Floating letter tiles */}
      {TILES.map((t) => (
        <LetterTile key={t.char + t.x} {...t} />
      ))}
    </>
  );
}

const TILES: TileProps[] = [
  { char: "A", x: "8%",  y: "12%", rotate: -12, size: 28, opacity: 0.07 },
  { char: "B", x: "88%", y: "8%",  rotate: 8,   size: 22, opacity: 0.06 },
  { char: "N", x: "15%", y: "78%", rotate: 15,  size: 26, opacity: 0.07 },
  { char: "Z", x: "82%", y: "72%", rotate: -8,  size: 24, opacity: 0.06 },
  { char: "G", x: "72%", y: "30%", rotate: 10,  size: 20, opacity: 0.05 },
  { char: "IJ",x: "5%",  y: "45%", rotate: -6,  size: 18, opacity: 0.06 },
  { char: "V", x: "92%", y: "48%", rotate: 14,  size: 22, opacity: 0.05 },
  { char: "E", x: "50%", y: "5%",  rotate: -4,  size: 20, opacity: 0.05 },
];

interface TileProps {
  char: string;
  x: string;
  y: string;
  rotate: number;
  size: number;
  opacity: number;
}

function LetterTile({ char, x, y, rotate, size, opacity }: TileProps) {
  return (
    <div
      className="pointer-events-none absolute font-heading font-bold text-primary select-none"
      style={{
        left: x,
        top: y,
        fontSize: size * 2,
        opacity,
        transform: `rotate(${rotate}deg)`,
      }}
    >
      {char}
    </div>
  );
}
