// Historical outcome tracking: did a past setup's price plan hold up since it was published?
//
// Definition (chosen by the site owner): a setup "held true" if the stop was never closed
// through, and the latest close is at or beyond entry, progressing toward (or past) the target.
// This is a read-only audit computed entirely from already-published data — the run's recorded
// plan levels plus the symbol's continuously updated daily bars — no new backend needed.

import type { OhlcvBar } from "./csv";
import type { Side } from "./types";

export type OutcomeStatus = "target_hit" | "on_track" | "pending" | "stopped_out" | "insufficient_data";

export interface OutcomeResult {
  status: OutcomeStatus;
  heldTrue: boolean; // target_hit or on_track
  daysElapsed: number;
  lastClose: number | null;
  lastDate: string | null;
  stopBreachedOn: string | null;
  targetReachedOn: string | null;
}

export function evaluateOutcome(side: Side, entry: number, stop: number, target: number, setupDate: string, bars: OhlcvBar[]): OutcomeResult {
  const after = bars.filter((b) => b.date > setupDate).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (after.length === 0) {
    return { status: "insufficient_data", heldTrue: false, daysElapsed: 0, lastClose: null, lastDate: null, stopBreachedOn: null, targetReachedOn: null };
  }
  const long = side === "long";
  let stopBreachedOn: string | null = null;
  let targetReachedOn: string | null = null;
  for (const b of after) {
    if (stopBreachedOn == null && (long ? b.c <= stop : b.c >= stop)) stopBreachedOn = b.date;
    if (targetReachedOn == null && (long ? b.c >= target : b.c <= target)) targetReachedOn = b.date;
    // a stop breach on the same or an earlier bar than the target reach wins (risk-first)
    if (stopBreachedOn != null && (targetReachedOn == null || stopBreachedOn <= targetReachedOn)) break;
  }
  const last = after[after.length - 1];
  const stoppedFirst = stopBreachedOn != null && (targetReachedOn == null || stopBreachedOn <= targetReachedOn);

  let status: OutcomeStatus;
  if (stoppedFirst) status = "stopped_out";
  else if (targetReachedOn != null) status = "target_hit";
  else if (long ? last.c >= entry : last.c <= entry) status = "on_track";
  else status = "pending"; // hasn't moved the favourable direction yet, but stop not hit either

  return {
    status,
    heldTrue: status === "target_hit" || status === "on_track",
    daysElapsed: after.length,
    lastClose: last.c,
    lastDate: last.date,
    stopBreachedOn: stoppedFirst ? stopBreachedOn : null,
    targetReachedOn: status === "target_hit" ? targetReachedOn : null,
  };
}

export const OUTCOME_LABEL: Record<OutcomeStatus, string> = {
  target_hit: "Target hit",
  on_track: "On track",
  pending: "Not triggered yet",
  stopped_out: "Stopped out",
  insufficient_data: "Too new",
};

/** "pending" reads differently depending on direction: price above entry is bad news for a
 * short (favourable is a fall) and the reverse for a long. */
export function outcomeLabel(status: OutcomeStatus, side: Side): string {
  if (status !== "pending") return OUTCOME_LABEL[status];
  return side === "long" ? "Below entry" : "Above entry";
}
