import type { Snapshot } from "@pulse/shared";
import { computeStaleness } from "./format";

export type PollStatus = "fresh" | "stale" | "error";

export interface PollState {
  snapshot: Snapshot;
  status: PollStatus;
}

export type PollEvent =
  | { kind: "success"; snapshot: Snapshot; now: Date }
  | { kind: "failure" }
  | { kind: "recheck"; now: Date };

function freshness(snapshot: Snapshot, now: Date): PollStatus {
  return computeStaleness(snapshot.generatedAt, now).isStale ? "stale" : "fresh";
}

/** Pure state transition for the snapshot poller (the SnapshotClient core). */
export function reducePoll(state: PollState, event: PollEvent): PollState {
  switch (event.kind) {
    case "success":
      return { snapshot: event.snapshot, status: freshness(event.snapshot, event.now) };
    case "failure":
      return { ...state, status: "error" };
    case "recheck":
      return { ...state, status: freshness(state.snapshot, event.now) };
  }
}
