import { useEffect, useReducer } from "react";
import { SCHEMA_VERSION, type Snapshot } from "@pulse/shared";
import { reducePoll, type PollState } from "./poller";

const POLL_MS = 30_000;
const RECHECK_MS = 15_000;

/**
 * Seeds from the SSR snapshot, then polls the public snapshot URL on the client
 * and re-checks staleness between polls. SSR-safe: effects run only in the browser.
 */
export function useSnapshot(initial: Snapshot, snapshotUrl?: string) {
  const [state, dispatch] = useReducer(reducePoll, {
    snapshot: initial,
    status: "fresh",
  } satisfies PollState);

  useEffect(() => {
    // No live source (dev / fixture) → keep the SSR snapshot, don't poll.
    if (!snapshotUrl) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await fetch(snapshotUrl, { headers: { accept: "application/json" } });
        if (!res.ok) throw new Error(`snapshot HTTP ${res.status}`);
        const snapshot = (await res.json()) as Snapshot;
        if (snapshot?.schemaVersion !== SCHEMA_VERSION) throw new Error("schema mismatch");
        if (active) dispatch({ kind: "success", snapshot, now: new Date() });
      } catch {
        // On failure (network / CORS / schema) keep the last good snapshot —
        // never revert to the bundled sample on the client.
        if (active) dispatch({ kind: "failure" });
      }
    };
    const pollId = setInterval(poll, POLL_MS);
    const recheckId = setInterval(() => active && dispatch({ kind: "recheck", now: new Date() }), RECHECK_MS);
    return () => {
      active = false;
      clearInterval(pollId);
      clearInterval(recheckId);
    };
  }, [snapshotUrl]);

  return state;
}
