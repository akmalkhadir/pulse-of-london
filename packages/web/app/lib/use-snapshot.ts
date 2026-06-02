import { useEffect, useReducer } from "react";
import type { Snapshot } from "@pulse/shared";
import { reducePoll, type PollState } from "./poller";
import { loadSnapshot } from "./snapshot-source";

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
    let active = true;
    const poll = async () => {
      try {
        const snapshot = await loadSnapshot({ SNAPSHOT_URL: snapshotUrl });
        if (active) dispatch({ kind: "success", snapshot, now: new Date() });
      } catch {
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
