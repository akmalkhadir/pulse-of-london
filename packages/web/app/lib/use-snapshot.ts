import { useEffect, useReducer, useRef } from "react";
import { SCHEMA_VERSION, type Snapshot } from "@pulse/shared";
import { reducePoll, type PollState } from "./poller";

// The poller rewrites the snapshot once a minute, so polling faster only re-reads
// the same object. Each station itself refreshes ~every 9 minutes.
const POLL_MS = 60_000;
const RECHECK_MS = 15_000;

/**
 * Seeds from the SSR snapshot, then polls the public snapshot URL directly from the
 * browser (R2 with a CORS rule for this site), so polls cost zero Worker requests.
 * Polling pauses while the tab is hidden and catches up when it becomes visible.
 * With no URL (dev/test, bundled sample) it only re-checks staleness.
 */
export function useSnapshot(initial: Snapshot, snapshotUrl: string | null) {
  const [state, dispatch] = useReducer(reducePoll, {
    snapshot: initial,
    status: "fresh",
  } satisfies PollState);
  const generatedAtRef = useRef(initial.generatedAt);

  useEffect(() => {
    let active = true;
    let lastPoll = Date.now();

    const poll = async () => {
      if (!snapshotUrl || document.hidden) return;
      lastPoll = Date.now();
      try {
        // no-cache = revalidate with the ETag, so an unchanged snapshot is a cheap 304.
        const res = await fetch(snapshotUrl, { cache: "no-cache", headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`);
        const snapshot = (await res.json()) as Snapshot;
        if (snapshot?.schemaVersion !== SCHEMA_VERSION) throw new Error("schema mismatch");
        if (!active) return;
        if (snapshot.generatedAt === generatedAtRef.current) {
          dispatch({ kind: "recheck", now: new Date() });
          return;
        }
        generatedAtRef.current = snapshot.generatedAt;
        dispatch({ kind: "success", snapshot, now: new Date() });
      } catch {
        // On failure (network / CORS / schema) keep the last good snapshot —
        // never revert to the bundled sample on the client.
        if (active) dispatch({ kind: "failure" });
      }
    };

    const onVisibility = () => {
      if (!document.hidden && Date.now() - lastPoll >= POLL_MS) void poll();
    };

    // Judge freshness straight away: an old SSR snapshot (overnight, stalled feed) shows its notice on load.
    dispatch({ kind: "recheck", now: new Date() });
    const pollId = setInterval(poll, POLL_MS);
    const recheckId = setInterval(() => active && dispatch({ kind: "recheck", now: new Date() }), RECHECK_MS);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      active = false;
      clearInterval(pollId);
      clearInterval(recheckId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [snapshotUrl]);

  return state;
}
