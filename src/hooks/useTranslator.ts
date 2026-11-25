import { useCallback, useEffect, useRef, useState } from "react";

const STORAGE_LANG_KEY = "auc-zh-lang";

function hasChinese(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

interface QueueOptions {
  replacePending?: boolean;
}

export function useTranslator() {
  const [showOriginal, setShowOriginal] = useState<boolean>(() => {
    try {
      return localStorage.getItem(STORAGE_LANG_KEY) === "en";
    } catch {
      return false;
    }
  });

  const [dict, setDict] = useState<Record<string, string>>({});
  const [translating, setTranslating] = useState(false);

  const dictRef = useRef<Record<string, string>>({});
  const queueRef = useRef<string[]>([]);
  const queuedSetRef = useRef<Set<string>>(new Set());
  const inflightRef = useRef<Set<string>>(new Set());
  const retriesRef = useRef<Map<string, number>>(new Map());
  const workerRunningRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const toggleLanguage = useCallback(() => {
    setShowOriginal((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_LANG_KEY, next ? "en" : "zh");
      } catch {}
      return next;
    });
  }, []);

  const applyTranslations = useCallback((map: Record<string, string>) => {
    let changed = false;
    for (const [k, v] of Object.entries(map)) {
      if (typeof v === "string" && v && v !== k && dictRef.current[k] !== v) {
        dictRef.current[k] = v;
        changed = true;
      }
    }
    if (changed && mountedRef.current) {
      setDict({ ...dictRef.current });
    }
  }, []);

  const runWorker = useCallback(async () => {
    if (workerRunningRef.current) return;
    workerRunningRef.current = true;
    if (mountedRef.current) setTranslating(true);

    try {
      while (queueRef.current.length > 0 && mountedRef.current) {
        // Pull up to 12 texts per batch for snappy progressive rendering
        const slice: string[] = [];
        while (slice.length < 12 && queueRef.current.length > 0) {
          const next = queueRef.current.shift()!;
          queuedSetRef.current.delete(next);
          if (!dictRef.current[next] && !inflightRef.current.has(next)) {
            slice.push(next);
            inflightRef.current.add(next);
          }
        }

        if (slice.length === 0) continue;

        try {
          const res = await fetch("/api/translate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ texts: slice }),
          });
          if (res.ok) {
            const data = await res.json();
            const map = (data?.translations || {}) as Record<string, string>;
            applyTranslations(map);

            // Re-queue any item that failed to translate once with a small backoff
            for (const orig of slice) {
              const got = map[orig];
              if (!got || got === orig) {
                const tries = retriesRef.current.get(orig) || 0;
                if (tries < 1) {
                  retriesRef.current.set(orig, tries + 1);
                  queueRef.current.push(orig);
                  queuedSetRef.current.add(orig);
                }
              }
            }
          }
        } catch {
          // Network hiccup: allow 1 retry
          for (const orig of slice) {
            const tries = retriesRef.current.get(orig) || 0;
            if (tries < 1) {
              retriesRef.current.set(orig, tries + 1);
              queueRef.current.push(orig);
              queuedSetRef.current.add(orig);
            }
          }
        } finally {
          slice.forEach((t) => inflightRef.current.delete(t));
        }

        if (queueRef.current.length > 0) {
          await new Promise((r) => setTimeout(r, 80));
        }
      }
    } finally {
      workerRunningRef.current = false;
      if (mountedRef.current) setTranslating(false);
    }
  }, [applyTranslations]);

  const queueTranslate = useCallback(
    (texts: (string | null | undefined)[], options?: QueueOptions) => {
      if (options?.replacePending) {
        queueRef.current = [];
        queuedSetRef.current.clear();
      }

      const toAdd: string[] = [];
      for (const raw of texts) {
        if (!raw) continue;
        const t = raw.trim();
        if (
          !t ||
          hasChinese(t) ||
          dictRef.current[t] ||
          inflightRef.current.has(t) ||
          queuedSetRef.current.has(t)
        ) {
          continue;
        }
        queuedSetRef.current.add(t);
        toAdd.push(t);
      }

      if (toAdd.length > 0) {
        // Prioritize newly visible texts at the front of the queue
        queueRef.current = [...toAdd, ...queueRef.current];
        void runWorker();
      }
    },
    [runWorker]
  );

  const translateNow = useCallback(
    async (texts: (string | null | undefined)[]) => {
      const batch = texts
        .map((t) => (t ? t.trim() : ""))
        .filter((t) => t && !hasChinese(t) && !dictRef.current[t]);
      if (batch.length === 0) return;
      try {
        const res = await fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ texts: batch }),
        });
        if (res.ok) {
          const data = await res.json();
          applyTranslations(data?.translations || {});
        }
      } catch {}
    },
    [applyTranslations]
  );

  const tr = useCallback(
    (text: string | null | undefined): string => {
      if (!text) return "";
      const trimmed = text.trim();
      if (showOriginal || hasChinese(trimmed)) return trimmed;
      return dict[trimmed] || trimmed;
    },
    [dict, showOriginal]
  );

  const trSync = useCallback((text: string | null | undefined): string => {
    if (!text) return "";
    const trimmed = text.trim();
    return dictRef.current[trimmed] || trimmed;
  }, []);

  return {
    tr,
    trSync,
    queueTranslate,
    translateNow,
    showOriginal,
    toggleLanguage,
    translating,
    translatedCount: Object.keys(dict).length,
  };
}
