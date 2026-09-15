import { useLiveQuery } from "dexie-react-hooks";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { db } from "../lib/db";
import { useActiveConfigVersion, useConfigProfile } from "../lib/dataClient";
import { calibrationReady, decileStats } from "../lib/likelihood";
import { fmtR } from "../lib/format";
import { Card, Empty, Warn } from "../components/ui";

export default function Analytics() {
  const active = useActiveConfigVersion();
  const profile = useConfigProfile(active.data?.active);
  const minSamples = (profile.data?.values.min_samples_for_calibration as number | undefined) ?? 100;
  const closed = useLiveQuery(() => db.journal.where("status").equals("closed").toArray(), []) ?? [];
  const withR = closed.filter((t) => t.realised_r != null).sort((a, b) => (a.closed_at ?? "").localeCompare(b.closed_at ?? ""));
  const ready = calibrationReady(withR.length, minSamples);

  let cum = 0;
  const equity = withR.map((t, i) => { cum += t.realised_r!; return { i: i + 1, date: t.closed_at?.slice(0, 10), cumR: Number(cum.toFixed(2)) }; });
  const buckets = [-3, -2, -1, 0, 1, 2, 3, 4, 5];
  const dist = buckets.map((b) => ({ bucket: `${b}R`, n: withR.filter((t) => Math.floor(t.realised_r!) === b || (b === 5 && t.realised_r! >= 5) || (b === -3 && t.realised_r! < -2)).length }));
  const maxPossible = withR[0]?.score_max ?? 105;
  const deciles = decileStats(withR.map((t) => ({ score_raw: t.score_raw, realised_r: t.realised_r! })), maxPossible);
  const hits = withR.filter((t) => t.realised_r! > 0).length;

  return (
    <div className="space-y-4">
      {!ready && (
        <Warn level="info">
          <b>{withR.length} / {minSamples}</b> closed trades logged. Until the sample reaches min_samples_for_calibration only raw scores, normalised scores and bands are shown for candidates. The figures below describe your own logged outcomes and nothing else.
        </Warn>
      )}
      <div className="grid gap-4 md:grid-cols-3">
        <Card title="Closed trades"><div className="mono text-2xl">{withR.length}</div></Card>
        <Card title="Hit rate (historical, n shown)"><div className="mono text-2xl">{withR.length ? `${((hits / withR.length) * 100).toFixed(0)}%` : "—"}<span className="text-sm text-muted"> n={withR.length}</span></div></Card>
        <Card title="Average R"><div className="mono text-2xl">{withR.length ? fmtR(withR.reduce((s, t) => s + t.realised_r!, 0) / withR.length) : "—"}</div></Card>
      </div>
      <Card title="Equity curve (cumulative R by closed trade)">
        {equity.length < 2 ? <Empty>Needs at least two closed trades.</Empty> : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={equity}><CartesianGrid stroke="#1f2733" /><XAxis dataKey="i" stroke="#8b95a7" /><YAxis stroke="#8b95a7" unit="R" /><Tooltip contentStyle={{ background: "#121722", border: "1px solid #1f2733" }} /><Line type="monotone" dataKey="cumR" stroke="#6ea8fe" dot={false} /></LineChart>
          </ResponsiveContainer>
        )}
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card title="R distribution">
          {withR.length === 0 ? <Empty>No closed trades.</Empty> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={dist}><CartesianGrid stroke="#1f2733" /><XAxis dataKey="bucket" stroke="#8b95a7" /><YAxis stroke="#8b95a7" allowDecimals={false} /><Tooltip contentStyle={{ background: "#121722", border: "1px solid #1f2733" }} /><Bar dataKey="n" fill="#6ea8fe" /></BarChart>
            </ResponsiveContainer>
          )}
        </Card>
        <Card title={`Outcome by score decile (historical, ${withR.length} trades)`}>
          {!ready ? <Empty>Shown once {minSamples} closed trades exist.</Empty> : (
            <table className="data">
              <thead><tr><th>Decile</th><th>Score range</th><th className="text-right">n</th><th className="text-right">Hit rate</th><th className="text-right">Avg R</th></tr></thead>
              <tbody>
                {deciles.map((d) => (
                  <tr key={d.decile}><td>{d.decile}</td><td className="mono">{d.score_min.toFixed(0)}–{d.score_max.toFixed(0)} pts</td><td className="mono text-right">{d.n}</td><td className="mono text-right">{d.hit_rate == null ? "—" : `${(d.hit_rate * 100).toFixed(0)}%`}</td><td className="mono text-right">{fmtR(d.avg_r)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      <Card title="Per-component lift">
        <Empty>Requires per-component outcomes from the Phase 3 backtest. Not available yet.</Empty>
      </Card>
    </div>
  );
}
