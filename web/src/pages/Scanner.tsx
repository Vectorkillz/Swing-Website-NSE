import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useCandidates, useLatestRun, useRunIndex } from "../lib/dataClient";
import { fmtDateTime, fmtNum, fmtPct } from "../lib/format";
import type { Candidate, CapBucket, Grade, Side } from "../lib/types";
import SetupCard from "../components/SetupCard";
import SetupDetail from "../components/SetupDetail";
import { CAP_LABEL, Empty, Notice, RegimeBadge, Skeleton } from "../components/ui";

const CAPS: CapBucket[] = ["large", "mid", "small", "micro"];
const GRADES: Grade[] = ["A++", "A+", "A", "B+", "B"];
const GRADE_RANK: Record<Grade, number> = { "A++": 0, "A+": 1, A: 2, "B+": 3, B: 4 };

function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" className="pill" aria-pressed={on} onClick={onClick}>{children}</button>;
}

export default function Scanner() {
  const params = useParams<{ runId?: string }>();
  const { runId, run, latest } = useLatestRun(params.runId);
  const index = useRunIndex();
  const cands = useCandidates(runId);

  const [side, setSide] = useState<Side | "all">("all");
  const [caps, setCaps] = useState<Set<CapBucket>>(new Set());
  const [grades, setGrades] = useState<Set<Grade>>(new Set());
  const [sectors, setSectors] = useState<Set<string>>(new Set());
  const [mbOnly, setMbOnly] = useState(false);
  const [rankedOnly, setRankedOnly] = useState(true);
  const [open, setOpen] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);

  const all = cands.data?.candidates ?? [];
  const sectorList = useMemo(() => Array.from(new Set(all.map((c) => c.sector ?? "Unknown"))).sort(), [all]);

  const rows = useMemo(() => {
    const f = all.filter((c) =>
      (side === "all" || c.side === side) &&
      (caps.size === 0 || caps.has(c.cap_bucket)) &&
      (grades.size === 0 || (c.grade && grades.has(c.grade.grade))) &&
      (sectors.size === 0 || sectors.has(c.sector ?? "Unknown")) &&
      (!mbOnly || (c.multibagger && c.multibagger.level !== "none")) &&
      (!rankedOnly || c.rank_status === "ranked"),
    );
    return f.sort((a, b) => {
      const g = (a.grade ? GRADE_RANK[a.grade.grade] : 9) - (b.grade ? GRADE_RANK[b.grade.grade] : 9);
      if (a.side !== b.side) return a.side === "long" ? -1 : 1;
      if (g !== 0) return g;
      return (a.rank ?? 999) - (b.rank ?? 999) || b.score.raw - a.score.raw;
    });
  }, [all, side, caps, grades, sectors, mbOnly, rankedOnly]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement;
      if (t?.tagName === "INPUT" || t?.tagName === "SELECT") return;
      if (e.key === "j" || e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(rows.length - 1, c + 1)); }
      if (e.key === "k" || e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(0, c - 1)); }
      if (e.key === "Enter") { const r = rows[cursor]; if (r) setOpen(`${r.symbol}:${r.side}`); }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, cursor]);

  function toggle<T>(set: Set<T>, v: T, setter: (s: Set<T>) => void) {
    const n = new Set(set);
    if (n.has(v)) n.delete(v); else n.add(v);
    setter(n);
  }

  if (latest.isError) return <Empty>No scan published yet. The daily GitHub Actions run writes <code>data/runs/</code>.</Empty>;
  if (!run.data) return <div className="space-y-3"><Skeleton h={90} /><Skeleton h={140} /><Skeleton h={140} /></div>;
  const r = run.data;
  const openCand: Candidate | undefined = open ? all.find((c) => `${c.symbol}:${c.side}` === open) : undefined;

  return (
    <div className="space-y-5">
      <section className="fade-in">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Setups for {r.session_date}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
              <RegimeBadge regime={r.regime.regime} />
              <span>Nifty {fmtNum(r.regime.nifty_close, 0)} · VIX {fmtNum(r.regime.vix, 2)} · 18m {fmtPct(r.regime.roc_18m)}</span>
              <span>· {r.counts.ranked_long} long, {r.counts.ranked_short} short ranked · {r.counts.usable}/{r.counts.universe} symbols scanned</span>
            </div>
          </div>
          <div className="text-right text-[11px] text-muted">
            <div>updated {fmtDateTime(r.generated_at)}</div>
            {index.data && index.data.runs.length > 1 && (
              <select className="input mt-1" value={runId} onChange={(e) => (window.location.hash = `#/run/${e.target.value}`)} aria-label="Choose run">
                {index.data.runs.map((x) => <option key={x.run_id} value={x.run_id}>{x.session_date} · {x.regime}</option>)}
              </select>
            )}
          </div>
        </div>
        {r.status !== "ok" && <div className="mt-3"><Notice level={r.status === "no_scan_regime_unknown" ? "error" : "warn"}>Run status <b>{r.status}</b>{r.warnings.length ? `: ${r.warnings.join("; ")}` : ""}</Notice></div>}
        {!r.ban_list.available && <div className="mt-2"><Notice>F&amp;O ban list unavailable: short setups could not be verified.</Notice></div>}
        {!r.regime.longs_allowed && <div className="mt-2"><Notice level="info">Regime {r.regime.regime}: long setups are not generated.</Notice></div>}
      </section>

      <section className="space-y-2">
        <div className="flex flex-wrap gap-2">
          {(["all", "long", "short"] as const).map((s) => <Pill key={s} on={side === s} onClick={() => setSide(s)}>{s === "all" ? "All" : s === "long" ? "Long" : "Short"}</Pill>)}
          <span className="mx-1 self-center text-white/10">|</span>
          {GRADES.map((g) => <Pill key={g} on={grades.has(g)} onClick={() => toggle(grades, g, setGrades)}>{g}</Pill>)}
          <span className="mx-1 self-center text-white/10">|</span>
          {CAPS.map((c) => <Pill key={c} on={caps.has(c)} onClick={() => toggle(caps, c, setCaps)}>{CAP_LABEL[c]}</Pill>)}
          <span className="mx-1 self-center text-white/10">|</span>
          <Pill on={mbOnly} onClick={() => setMbOnly(!mbOnly)}>✦ Multibagger potential</Pill>
          <Pill on={!rankedOnly} onClick={() => setRankedOnly(!rankedOnly)}>Show all matches</Pill>
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-muted hover:text-text">Sectors{sectors.size ? ` (${sectors.size})` : ""}</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            {sectorList.map((s) => <Pill key={s} on={sectors.has(s)} onClick={() => toggle(sectors, s, setSectors)}>{s}</Pill>)}
            {sectors.size > 0 && <button className="btn" onClick={() => setSectors(new Set())}>Clear</button>}
          </div>
        </details>
      </section>

      {openCand ? (
        <SetupDetail cand={openCand} onClose={() => setOpen(null)} />
      ) : cands.isLoading ? (
        <div className="grid gap-3 md:grid-cols-2"><Skeleton h={180} /><Skeleton h={180} /><Skeleton h={180} /><Skeleton h={180} /></div>
      ) : rows.length === 0 ? (
        <Empty>No setups match these filters{rankedOnly && all.length > 0 ? " — try \"Show all matches\"" : ""}. {all.length === 0 && r.scan_performed ? "The rules found no qualifying setups this session; that is a valid outcome." : ""}</Empty>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {rows.map((c, i) => <SetupCard key={`${c.symbol}:${c.side}`} cand={c} selected={i === cursor} onOpen={() => { setCursor(i); setOpen(`${c.symbol}:${c.side}`); }} />)}
        </div>
      )}
      <p className="text-[11px] text-muted">Setups are rule matches on end-of-day data. Levels are price zones for your own decision; nothing here forecasts price movement. Keys: j/k move, Enter open, Esc close.</p>
    </div>
  );
}
