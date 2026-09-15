import { useEffect, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, reviewKey, type ReviewDecision } from "../lib/db";
import type { Candidate } from "../lib/types";

interface Props {
  runId: string;
  configVersion: string;
  cand: Candidate;
}

export default function ReviewControls({ runId, configVersion, cand }: Props) {
  const key = reviewKey(runId, cand.symbol, cand.side);
  const review = useLiveQuery(() => db.reviews.get(key), [key]);
  const planned = useLiveQuery(() => db.journal.where({ run_id: runId, symbol: cand.symbol, side: cand.side }).first(), [runId, cand.symbol, cand.side]);
  const [note, setNote] = useState("");
  useEffect(() => setNote(review?.note ?? ""), [review?.note]);

  async function decide(decision: ReviewDecision) {
    await db.reviews.put({ key, run_id: runId, symbol: cand.symbol, side: cand.side, decision, note, updated_at: new Date().toISOString() });
    if (decision === "accepted" && cand.plan && !planned) {
      await db.journal.add({
        run_id: runId,
        config_version: configVersion,
        symbol: cand.symbol,
        side: cand.side,
        sector: cand.sector,
        score_raw: cand.score.raw,
        score_max: cand.score.max_possible,
        planned_entry: cand.plan.entry,
        planned_entry_max: cand.plan.entry_max,
        planned_stop: cand.plan.stop,
        planned_qty: cand.plan.qty,
        planned_risk_amount: cand.plan.risk_amount,
        plan_snapshot: cand.plan,
        fill_price: null,
        fill_date: null,
        qty: cand.plan.qty,
        stop: cand.plan.stop,
        exits: [],
        fees: 0,
        status: "planned",
        closed_at: null,
        realised_r: null,
        review: "",
        created_at: new Date().toISOString(),
      });
    }
  }

  async function saveNote() {
    if (!review) return;
    await db.reviews.put({ ...review, note, updated_at: new Date().toISOString() });
  }

  const btn = (d: ReviewDecision, label: string, hotkey: string) => (
    <button type="button" className={`btn ${review?.decision === d ? "btn-primary" : ""}`} onClick={() => decide(d)} title={`Shortcut: ${hotkey}`} disabled={d === "accepted" && !cand.plan}>
      {label}
    </button>
  );

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {btn("accepted", "Accept → journal", "a")}
        {btn("watch", "Watch", "w")}
        {btn("rejected", "Reject", "r")}
        {planned && <span className="self-center text-xs text-long">planned trade #{planned.id} in journal</span>}
      </div>
      <div className="flex gap-2">
        <input className="input" placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} aria-label="Review note" />
      </div>
      {review && <div className="text-xs text-muted">Marked {review.decision} at {new Date(review.updated_at).toLocaleString()}</div>}
    </div>
  );
}
