import { useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, exportAll, importAll, realisedR, type JournalExit, type JournalTrade } from "../lib/db";
import { fmtInr, fmtNum, fmtPct, fmtR } from "../lib/format";
import { Card, Empty, SideBadge, Warn } from "../components/ui";

function TradeRow({ t }: { t: JournalTrade }) {
  const [fill, setFill] = useState(t.fill_price?.toString() ?? "");
  const [fillDate, setFillDate] = useState(t.fill_date ?? new Date().toISOString().slice(0, 10));
  const [exitPrice, setExitPrice] = useState("");
  const [exitQty, setExitQty] = useState("");
  const [exitKind, setExitKind] = useState<JournalExit["kind"]>("manual");
  const [stop, setStop] = useState(t.stop.toString());
  const [review, setReview] = useState(t.review);
  const chased = t.fill_price != null && t.planned_entry_max != null && t.side === "long" && t.fill_price > t.planned_entry_max;
  const exitedQty = t.exits.reduce((s, e) => s + e.qty, 0);

  async function recordFill() {
    const p = Number(fill);
    if (!p) return;
    await db.journal.update(t.id!, { fill_price: p, fill_date: fillDate, status: "open" });
  }
  async function recordExit() {
    const p = Number(exitPrice), q = Number(exitQty);
    if (!p || !q) return;
    const exits = [...t.exits, { date: new Date().toISOString().slice(0, 10), price: p, qty: q, kind: exitKind }];
    const total = exits.reduce((s, e) => s + e.qty, 0);
    const next: Partial<JournalTrade> = { exits };
    if (total >= t.qty) {
      next.status = "closed";
      next.closed_at = new Date().toISOString();
      next.realised_r = realisedR({ ...t, exits });
    }
    await db.journal.update(t.id!, next);
    setExitPrice(""); setExitQty("");
  }
  async function saveStop() { const s = Number(stop); if (s) await db.journal.update(t.id!, { stop: s }); }
  async function saveReview() { await db.journal.update(t.id!, { review }); }
  async function remove() { if (confirm(`Delete journal entry ${t.symbol}?`)) await db.journal.delete(t.id!); }

  return (
    <div className="card space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">{t.symbol}</span>
        <SideBadge side={t.side} />
        <span className="text-muted">{t.sector ?? "—"} · run {t.run_id} · score {t.score_raw.toFixed(0)}/{t.score_max.toFixed(0)} pts</span>
        <span className={`badge ml-auto ${t.status === "open" ? "bg-accent/20 text-accent" : t.status === "closed" ? "bg-line" : "bg-warn/20 text-warn"}`}>{t.status}</span>
        <button className="btn text-xs" onClick={remove}>Delete</button>
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <span>Plan: entry {fmtInr(t.planned_entry)}{t.planned_entry_max != null && ` (max ${fmtInr(t.planned_entry_max)})`}</span>
        <span>stop {fmtInr(t.planned_stop)}</span>
        <span>qty {fmtNum(t.planned_qty)}</span>
        <span>1R {fmtInr(t.planned_risk_amount, 0)}</span>
      </div>
      {chased && <Warn>Fill {fmtInr(t.fill_price)} is above the do-not-chase limit {fmtInr(t.planned_entry_max)}. Risk on this trade exceeds the plan.</Warn>}
      {t.status === "planned" && (
        <div className="flex flex-wrap items-end gap-2 text-sm">
          <label>Fill price <input className="input w-28" value={fill} onChange={(e) => setFill(e.target.value)} inputMode="decimal" /></label>
          <label>Fill date <input className="input w-36" type="date" value={fillDate} onChange={(e) => setFillDate(e.target.value)} /></label>
          <button className="btn btn-primary" onClick={recordFill}>Record fill</button>
          {fill && t.planned_entry_max != null && t.side === "long" && Number(fill) > t.planned_entry_max && <span className="text-xs text-warn">above entry max — chased</span>}
        </div>
      )}
      {t.status === "open" && (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap gap-4 text-xs">
            <span>Filled {fmtInr(t.fill_price)} on {t.fill_date}</span>
            <span>Exited {exitedQty}/{t.qty}</span>
            <span>Distance to stop {fmtPct(t.fill_price ? Math.abs(t.fill_price - t.stop) / t.fill_price * 100 : null, 2)}</span>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label>Current stop <input className="input w-28" value={stop} onChange={(e) => setStop(e.target.value)} onBlur={saveStop} inputMode="decimal" /></label>
            <label>Exit price <input className="input w-28" value={exitPrice} onChange={(e) => setExitPrice(e.target.value)} inputMode="decimal" /></label>
            <label>Qty <input className="input w-20" value={exitQty} onChange={(e) => setExitQty(e.target.value)} inputMode="numeric" /></label>
            <label>Kind <select className="input w-auto" value={exitKind} onChange={(e) => setExitKind(e.target.value as JournalExit["kind"])}>{["manual", "partial_1", "partial_2", "stop", "trail", "target_1", "target_2"].map((k) => <option key={k}>{k}</option>)}</select></label>
            <button className="btn btn-primary" onClick={recordExit}>Record exit</button>
          </div>
        </div>
      )}
      {t.exits.length > 0 && (
        <table className="w-full text-xs"><tbody>{t.exits.map((e, i) => <tr key={i}><td>{e.date}</td><td>{e.kind}</td><td className="mono text-right">{fmtNum(e.qty)} @ {fmtInr(e.price)}</td></tr>)}</tbody></table>
      )}
      {t.status === "closed" && <div className="text-sm">Realised <span className={`mono ${(t.realised_r ?? 0) >= 0 ? "text-long" : "text-short"}`}>{fmtR(t.realised_r)}</span> · closed {t.closed_at?.slice(0, 10)}</div>}
      <input className="input" placeholder="Post-trade review" value={review} onChange={(e) => setReview(e.target.value)} onBlur={saveReview} />
    </div>
  );
}

export default function Journal() {
  const trades = useLiveQuery(() => db.journal.orderBy("id").reverse().toArray(), []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const open = (trades ?? []).filter((t) => t.status !== "closed");
  const closed = (trades ?? []).filter((t) => t.status === "closed");
  const totalR = closed.reduce((s, t) => s + (t.realised_r ?? 0), 0);

  async function doExport() {
    const text = await exportAll();
    const blob = new Blob([text], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `nse-swing-scanner-journal-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function doImport(mode: "merge" | "replace") {
    const f = fileRef.current?.files?.[0];
    if (!f) { setMsg("Choose a file first."); return; }
    if (mode === "replace" && !confirm("Replace ALL local reviews and journal entries with the file contents?")) return;
    const n = await importAll(await f.text(), mode);
    setMsg(`Imported ${n.journal} journal entries and ${n.reviews} reviews (${mode}).`);
  }

  return (
    <div className="space-y-4">
      <Warn level="info">The journal lives only in this browser (IndexedDB). Export regularly; import restores it on another device.</Warn>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button className="btn" onClick={doExport}>Export JSON</button>
        <input ref={fileRef} type="file" accept="application/json" className="text-xs" aria-label="Journal file to import" />
        <button className="btn" onClick={() => doImport("merge")}>Import (merge)</button>
        <button className="btn" onClick={() => doImport("replace")}>Import (replace)</button>
        {msg && <span className="text-xs text-muted">{msg}</span>}
        <span className="ml-auto text-xs text-muted">{open.length} open/planned · {closed.length} closed · total {fmtR(totalR)}</span>
      </div>
      <Card title={`Open and planned (${open.length})`}>
        {open.length === 0 ? <Empty>Accept a candidate to create a planned trade.</Empty> : <div className="space-y-3">{open.map((t) => <TradeRow key={t.id} t={t} />)}</div>}
      </Card>
      <Card title={`Closed (${closed.length})`}>
        {closed.length === 0 ? <Empty>No closed trades yet.</Empty> : (
          <div className="overflow-x-auto">
            <table className="data">
              <thead><tr><th>Symbol</th><th>Side</th><th className="text-right">Score</th><th className="text-right">Fill</th><th className="text-right">Stop</th><th className="text-right">Realised</th><th>Closed</th><th>Review</th></tr></thead>
              <tbody>
                {closed.map((t) => (
                  <tr key={t.id}><td>{t.symbol}</td><td><SideBadge side={t.side} /></td><td className="mono text-right">{t.score_raw.toFixed(0)} pts</td><td className="mono text-right">{fmtInr(t.fill_price)}</td><td className="mono text-right">{fmtInr(t.planned_stop)}</td><td className={`mono text-right ${(t.realised_r ?? 0) >= 0 ? "text-long" : "text-short"}`}>{fmtR(t.realised_r)}</td><td>{t.closed_at?.slice(0, 10)}</td><td className="text-xs text-muted">{t.review}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
