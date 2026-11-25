import { useCallback, useEffect, useRef, useState } from "react";

export type AsyncAnimeState = "idle" | "waiting" | "running" | "finished";

interface UseAnimeAsyncOptions {
  delay?: number;
  period?: number;
}

/**
 * Anti-flicker async loading state hook (delay + minimum display period):
 * - If the async operation finishes within `delay` ms, loading UI never flashes.
 * - Once loading UI becomes visible, it stays visible for at least `period` ms.
 */
export function useAnimeAsync({
  delay = 180,
  period = 360,
}: UseAnimeAsyncOptions = {}) {
  const [state, setState] = useState<AsyncAnimeState>("idle");
  const shownAtRef = useRef<number>(0);
  const delayTimerRef = useRef<number | null>(null);
  const periodTimerRef = useRef<number | null>(null);
  const pendingDoneRef = useRef<(() => void) | null>(null);

  const clearTimers = useCallback(() => {
    if (delayTimerRef.current !== null) {
      window.clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
    if (periodTimerRef.current !== null) {
      window.clearTimeout(periodTimerRef.current);
      periodTimerRef.current = null;
    }
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  const start = useCallback(() => {
    clearTimers();
    pendingDoneRef.current = null;
    shownAtRef.current = 0;
    setState("waiting");

    delayTimerRef.current = window.setTimeout(() => {
      delayTimerRef.current = null;
      shownAtRef.current = Date.now();
      setState("running");
    }, delay);
  }, [clearTimers, delay]);

  const finish = useCallback(
    (onDone?: () => void) => {
      if (delayTimerRef.current !== null) {
        // Finished before `delay` elapsed: skip showing loading altogether
        window.clearTimeout(delayTimerRef.current);
        delayTimerRef.current = null;
        setState("finished");
        onDone?.();
        return;
      }

      if (shownAtRef.current === 0) {
        setState("finished");
        onDone?.();
        return;
      }

      const elapsed = Date.now() - shownAtRef.current;
      const remaining = period - elapsed;
      if (remaining <= 0) {
        setState("finished");
        onDone?.();
      } else {
        pendingDoneRef.current = onDone ?? null;
        periodTimerRef.current = window.setTimeout(() => {
          periodTimerRef.current = null;
          setState("finished");
          pendingDoneRef.current?.();
          pendingDoneRef.current = null;
        }, remaining);
      }
    },
    [period]
  );

  return {
    state,
    showLoading: state === "running",
    isPending: state === "waiting" || state === "running",
    start,
    finish,
  };
}
