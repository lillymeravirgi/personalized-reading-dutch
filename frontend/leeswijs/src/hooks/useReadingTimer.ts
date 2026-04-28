import { useEffect, useRef, useState } from "react";

const MAX_TICK_DELTA_MS = 5_000;

// Dwell timer that pauses on tab blur so "open tab in background" doesn't
// inflate the reading time. Tick interval is 1s for cheap UI updates.
export function useReadingTimer(active: boolean = true) {
  const [elapsedMs, setElapsedMs] = useState(0);
  const runningRef = useRef(false);
  const lastTickRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      runningRef.current = false;
      lastTickRef.current = null;
      return;
    }

    runningRef.current = !document.hidden;
    lastTickRef.current = runningRef.current ? Date.now() : null;

    const tick = () => {
      if (!runningRef.current || lastTickRef.current === null) return;
      const now = Date.now();
      const delta = Math.min(
        Math.max(0, now - lastTickRef.current),
        MAX_TICK_DELTA_MS
      );
      setElapsedMs((ms) => ms + delta);
      lastTickRef.current = now;
    };

    const intervalId = window.setInterval(tick, 1000);

    const onVisibilityChange = () => {
      if (document.hidden) {
        tick();
        runningRef.current = false;
        lastTickRef.current = null;
      } else {
        runningRef.current = true;
        lastTickRef.current = Date.now();
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.clearInterval(intervalId);
      runningRef.current = false;
      lastTickRef.current = null;
    };
  }, [active]);

  return {
    elapsedMs,
    reset: () => setElapsedMs(0),
  };
}
