import { useMemo, useState } from "react";
import { useOhlcvBatch, useRunCandidates, useRunIndex } from "../lib/dataClient";
import { OUTCOME_LABEL, evaluateOutcome, outcomeLabel, type OutcomeStatus } from "../lib/outcomes";
import type { OhlcvBar } from "../lib/csv";
import { fmtInr } from "../lib/format";
import type { Candidate } from "../lib/types";
import { Empty, GradeBadge, RegimeBadge, SideBadge, Skeleton } from "../components/ui";

const WINDOWS = [
  { key: "week", label: "This week", days: 7 },
  { key: "2weeks", label: "Last 2 weeks", days: 14 },
  { key: "month", label: "Last month", days: 30 },
] as const;

const STATUS_CLS: Record<OutcomeStatus, string> = {
  target_hit: "bg-long/25 text-long", on_track: "bg-long/15 text-long", pending: "bg-white/10 text-muted", stopped_out: "bg-short/20 text-short", insufficient_data: "bg-white/5 text-muted",
};

interface Row {
  runId: string;
  sessionDate: string;
  regime: import("../lib/types").Regime;
  cand: Candidate;
}

export default function TrackRecord() {
  const [windowKey, setWindowKey] = useState<(typeof WINDOWS)[number]["key"]>("week");
  const [rankedOnly, setRankedOnly] = useState(true);
  const index = useRunIndex();

  const win = WINDOWS.find((w) => w.key === windowKey)!;
  const cutoff = useMemo(() => { const d = new Date(); d.setDate(d.getDate() - win.days); return d.toISOString().slice(0, 10); }, [win]);
  const runsInWindow = useMemo(() => (index.data?.runs ?? []).filter((r) => r.session_date >= cutoff && r.session_date < new Date().toISOString().slice(0, 10)), [index.data, cutoff]);
  const runIds = useMemo(() => runsInWindow.map((r) => r.run_id), [runsInWindow]);

  const candQueries = useRunCandidates(runIds);
  const rows: Row[] = useMemo(() => {
    const out: Row[] = [];
    runsInWindow.forEach((r, i) => {
      const data = candQueries[i]?.data;
      if (!data) return;
      for (const c of data.candidates) {
        if (rankedOnly && c.rank_status !== "ranked") continue;
        if (!c.plan) continue;
        out.push({ runId: r.run_id, sessionDate: r.session_date, regime: r.regime, cand: c });
      }
    });
    return out;
  }, [runsInWindow, candQueries, rankedOnly]);

  const symbols = useMemo(() => Array.from(new Set(rows.map((r) => r.cand.symbol))), [rows]);
  const barQueries = useOhlcvBatch(symbols);
  const barsBySymbol = useMemo(() => {
    const m = new Map<string, OhlcvBar[] | undefined>();
    symbols.forEach((s, i) => m.set(s, barQueries[i]?.data));
    return m;
  }, [symbols, barQueries]);

  const loading = index.isLoading || candQueries.some((q) => q.isLoading) || barQueries.some((q) => q.isLoading);

  const evaluated = useMemo(() => {
    return rows.map((r) => {
      const bars = barsBySymbol.get(r.cand.symbol);
      if (!bars || !r.cand.plan) return { ...r, outcome: null };
      const outcome = evaluateOutcome(r.cand.side, r.cand.plan.entry, r.cand.plan.stop, r.cand.plan.target, r.sessionDate, bars);
      return { ...r, outcome };
    });
  }, [rows, barsBySymbol]);

  const counts = useMemo(() => {
    const c: Record<OutcomeStatus, number> = { target_hit: 0, on_track: 0, pending: 0, stopped_out: 0, insufficient_data: 0 };
    for (const e of evaluated) if (e.outcome) c[e.outcome.status]++;
    return c;
  }, [evaluated]);
  const decided = evaluated.length - counts.insufficient_data;
  const heldCount = counts.target_hit + counts.on_track;

  return (
    <div className="space-y-4">
      <div className="fade-in">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Track record</h1>
        <p className="mt-1 text-sm text-muted">Setups published on past sessions, checked against what actually happened since. A setup "held true" if its stop was never closed through and price is at or beyond entry, on the way to (or already at) target.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {WINDOWS.map((w) => (
          <button key={w.key} type="button" className="pill" aria-pressed={windowKey === w.key} onClick={() => setWindowKey(w.key)}>{w.label}</button>
        ))}
        <button type="button" className="pill" aria-pressed={!rankedOnly} onClick={() => setRankedOnly(!rankedOnly)}>Include unranked matches</button>
        <span className="ml-auto text-xs text-muted">{runsInWindow.length} sessions in range</span>
      </div>

      {index.isError ? <Empty>No runs published yet.</Empty> : loading ? <Skeleton h={200} /> : evaluated.length === 0 ? (
        <Empty>No setups were published in this window{index.data && index.data.runs.length < 2 ? " yet — the track record fills in as more daily scans run." : "."}</Empty>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <div className="card text-center"><div className="mono text-2xl font-bold">{decided ? `${Math.round((heldCount / decided) * 100)}%` : "—"}</div><div className="label mt-1">Held true{decided ? ` (${heldCount}/${decided})` : ""}</div></div>
            {(["target_hit", "on_track", "pending", "stopped_out"] as const).map((s) => (
              <div key={s} className="card text-center"><div className="mono text-2xl font-bold">{counts[s]}</div><div className="label mt-1">{s === "pending" ? "Not triggered" : OUTCOME_LABEL[s]}</div></div>
            ))}
          </div>

          <div className="card overflow-x-auto p-0">
            <table className="data">
              <thead><tr><th>Symbol</th><th>Setup date</th><th>Regime</th><th>Grade</th><th className="text-right">Entry</th><th className="text-right">Target</th><th className="text-right">Stop</th><th className="text-right">Last close</th><th>Days</th><th>Outcome</th></tr></thead>
              <tbody>
                {evaluated.sort((a, b) => b.sessionDate.localeCompare(a.sessionDate)).map((e, i) => (
                  <tr key={`${e.runId}:${e.cand.symbol}:${e.cand.side}:${i}`}>
                    <td><span className="font-semibold">{e.cand.symbol}</span> <SideBadge side={e.cand.side} /></td>
                    <td className="text-xs text-muted">{e.sessionDate}</td>
                    <td><RegimeBadge regime={e.regime} /></td>
                    <td>{e.cand.grade && <GradeBadge grade={e.cand.grade.grade} />}</td>
                    <td className="mono text-right">{fmtInr(e.cand.plan?.entry)}</td>
                    <td className="mono text-right">{fmtInr(e.cand.plan?.target)}</td>
                    <td className="mono text-right">{fmtInr(e.cand.plan?.stop)}</td>
                    <td className="mono text-right">{e.outcome?.lastClose != null ? fmtInr(e.outcome.lastClose) : "—"}</td>
                    <td className="mono text-xs">{e.outcome?.daysElapsed ?? "—"}</td>
                    <td>{e.outcome && <span className={`badge ${STATUS_CLS[e.outcome.status]}`}>{outcomeLabel(e.outcome.status, e.cand.side)}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      <p className="text-[11px] text-muted">Computed from each session's published plan levels and the symbol's price history since. Past setups holding up is not a guarantee of future ones doing the same.</p>
    </div>
  );
}
