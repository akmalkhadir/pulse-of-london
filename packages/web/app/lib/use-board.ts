import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

/**
 * A ticking clock seeded from a deterministic timestamp, so the SSR and first
 * client render agree (no hydration mismatch); the real time takes over after mount.
 */
export function useNow(seedIso: string, intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date(Date.parse(seedIso) || 0));
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/**
 * Rows whose value changed between snapshots. The first snapshot only sets the
 * baseline; a key stays "changed" until markSeen() clears it.
 */
export function useChangedKeys<T>(
  items: T[],
  keyOf: (item: T) => string,
  valueOf: (item: T) => string,
  version: string,
) {
  const prevRef = useRef<Map<string, string> | null>(null);
  const [changed, setChanged] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    const next = new Map(items.map((i) => [keyOf(i), valueOf(i)]));
    const prev = prevRef.current;
    prevRef.current = next;
    if (!prev) return;
    const fresh: string[] = [];
    for (const [k, v] of next) if (prev.has(k) && prev.get(k) !== v) fresh.push(k);
    if (fresh.length > 0) setChanged((old) => new Set([...old, ...fresh]));
    // Only a new snapshot (version) re-diffs; items/keyOf/valueOf are derived from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const markSeen = useCallback((key: string) => {
    setChanged((old) => {
      if (!old.has(key)) return old;
      const next = new Set(old);
      next.delete(key);
      return next;
    });
  }, []);

  return { changed, markSeen };
}

/** Calls onSeen once the element has been mostly on screen for `dwellMs`. */
export function useSeen(ref: RefObject<Element | null>, active: boolean, onSeen: () => void, dwellMs = 2500) {
  const onSeenRef = useRef(onSeen);
  onSeenRef.current = onSeen;
  useEffect(() => {
    const el = ref.current;
    if (!active || !el || typeof IntersectionObserver === "undefined") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        clearTimeout(timer);
        if (entry?.isIntersecting && !document.hidden) timer = setTimeout(() => onSeenRef.current(), dwellMs);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      clearTimeout(timer);
      io.disconnect();
    };
  }, [ref, active, dwellMs]);
}

/** A per-viewer preference in localStorage that degrades to in-memory state. */
export function useStoredFlag(key: string, initial = false): [boolean, (v: boolean) => void] {
  const [value, setValue] = useState(initial);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw !== null) setValue(raw === "1");
    } catch {
      // storage blocked: keep the default
    }
  }, [key]);
  const set = useCallback(
    (v: boolean) => {
      setValue(v);
      try {
        window.localStorage.setItem(key, v ? "1" : "0");
      } catch {
        // storage blocked: the choice lasts for this page view
      }
    },
    [key],
  );
  return [value, set];
}
