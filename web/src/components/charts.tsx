// Small inline-SVG chart primitives. No chart library: keeps the bundle flat and the marks thin.
// Marks carry colour; text always uses text tokens. Every chart has a hover/title layer and the
// pages pair each one with a table view.
import { useId, useState } from "react";

export const C = { up: "#00E676", down: "#FF334B", seq: "#6EA8FE", grid: "rgb(var(--c-ink) / 0.08)", text: "rgb(var(--c-muted))" };

/** Semicircular meter, 0–100, with four zone arcs (fear to greed) and a needle. */
export function Gauge({ value, size = 260, zones = [30, 50, 70], label }: { value: number; size?: number; zones?: number[]; label: string }) {
  const w = size, h = size * 0.58, cx = w / 2, cy = h - 8, R = w / 2 - 10, r = R - 16;
  const ang = (v: number) => Math.PI - (Math.PI * v) / 100;
  const pt = (rad: number, a: number) => [cx + rad * Math.cos(a), cy - rad * Math.sin(a)] as const;
  const arc = (from: number, to: number, color: string, op: number) => {
    const [x0, y0] = pt(R, ang(from)), [x1, y1] = pt(R, ang(to)), [x2, y2] = pt(r, ang(to)), [x3, y3] = pt(r, ang(from));
    return <path key={from} d={`M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1} L${x2},${y2} A${r},${r} 0 0 0 ${x3},${y3} Z`} fill={color} opacity={op} />;
  };
  const stops = [0, ...zones, 100];
  const colors = [C.down, C.down, C.up, C.up], ops = [0.85, 0.4, 0.4, 0.85];
  const [nx, ny] = pt(r - 6, ang(value));
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ maxWidth: w }} role="img" aria-label={`${label}: ${value.toFixed(0)} of 100`}>
      {stops.slice(0, -1).map((s, i) => arc(s + (i ? 0.6 : 0), stops[i + 1] - (i < stops.length - 2 ? 0.6 : 0), colors[i], ops[i]))}
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="rgb(var(--c-text))" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={5} fill="rgb(var(--c-text))" />
      <text x={cx} y={cy - 26} textAnchor="middle" fontSize={size * 0.15} fontWeight={700} fill="rgb(var(--c-text))" fontFamily="Inter, system-ui, sans-serif">{value.toFixed(0)}</text>
      {[0, 100].map((v) => { const [x, y] = pt(R + 2, ang(v)); return <text key={v} x={x} y={y + 14} textAnchor="middle" fontSize={10} fill={C.text}>{v}</text>; })}
    </svg>
  );
}

/** Horizontal meter track for a 0–100 component. */
export function Meter({ value, color = C.seq }: { value: number; color?: string }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-ink/5" aria-hidden="true">
      <span className="block h-full rounded-full transition-[width] duration-500" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }} />
    </span>
  );
}

/** Horizontal bars; values may be negative (diverging around 0) or all positive. Labels ride the rows. */
export function HBars({ rows, unit = "", diverging = false, max }: { rows: { label: string; value: number; sub?: string }[]; unit?: string; diverging?: boolean; max?: number }) {
  const m = max ?? Math.max(1e-9, ...rows.map((r) => Math.abs(r.value)));
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => {
        const pct = Math.min(100, (Math.abs(r.value) / m) * (diverging ? 50 : 100));
        const neg = r.value < 0;
        return (
          <li key={r.label} className="grid grid-cols-[8rem_1fr_4.5rem] items-center gap-2 text-xs" title={`${r.label}: ${r.value.toFixed(1)}${unit}${r.sub ? ` · ${r.sub}` : ""}`}>
            <span className="truncate text-muted">{r.label}</span>
            <span className="relative block h-3 w-full">
              {diverging && <span className="absolute inset-y-0 left-1/2 w-px bg-ink/15" />}
              <span className="absolute inset-y-0.5" style={diverging ? { left: neg ? `calc(50% - ${pct}%)` : "50%", width: `${pct}%`, background: neg ? C.down : C.up, borderRadius: neg ? "3px 0 0 3px" : "0 3px 3px 0" } : { left: 0, width: `${pct}%`, background: C.seq, borderRadius: "0 3px 3px 0" }} />
            </span>
            <span className="mono text-right">{r.value >= 0 && diverging ? "+" : ""}{r.value.toFixed(1)}{unit}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Two-segment stacked bar (e.g. Stage 2 vs Stage 4) with a 2px surface gap. */
export function Split({ a, b, labelA, labelB }: { a: number; b: number; labelA: string; labelB: string }) {
  const t = a + b || 1;
  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`${labelA} ${a}, ${labelB} ${b}`}>
        <span style={{ width: `${(100 * a) / t}%`, background: C.up }} />
        <span style={{ width: `${(100 * b) / t}%`, background: C.down }} />
      </div>
      <div className="mt-1 flex justify-between text-[11px] text-muted"><span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: C.up }} />{labelA} {a}</span><span>{labelB} {b}<span className="ml-1 inline-block h-2 w-2 rounded-full" style={{ background: C.down }} /></span></div>
    </div>
  );
}

/** Histogram of a numeric field over fixed bins; a single hue, hover reads each bin. */
export function Histogram({ values, bins, min, max, format = (x: number) => x.toFixed(0), marks = [] }: { values: number[]; bins: number; min: number; max: number; format?: (x: number) => string; marks?: number[] }) {
  const counts = new Array(bins).fill(0) as number[];
  for (const v of values) { const i = Math.min(bins - 1, Math.max(0, Math.floor(((v - min) / (max - min)) * bins))); counts[i]++; }
  const top = Math.max(1, ...counts);
  const w = 100 / bins;
  return (
    <div>
      <svg viewBox="0 0 100 40" width="100%" preserveAspectRatio="none" style={{ height: 120 }} role="img" aria-label="Distribution">
        {counts.map((n, i) => (
          <g key={i}><title>{`${format(min + (i * (max - min)) / bins)} to ${format(min + ((i + 1) * (max - min)) / bins)}: ${n}`}</title>
            <rect x={i * w + 0.4} y={40 - (36 * n) / top} width={w - 0.8} height={(36 * n) / top} fill={C.seq} rx={0.6} />
            <rect x={i * w} y={0} width={w} height={40} fill="transparent" />
          </g>
        ))}
        {marks.map((m) => <line key={m} x1={((m - min) / (max - min)) * 100} x2={((m - min) / (max - min)) * 100} y1={0} y2={40} stroke="rgb(var(--c-text))" strokeOpacity={0.4} strokeWidth={0.4} vectorEffect="non-scaling-stroke" />)}
      </svg>
      <div className="flex justify-between text-[10px] text-muted"><span>{format(min)}</span>{marks.map((m) => <span key={m}>{format(m)}</span>)}<span>{format(max)}</span></div>
    </div>
  );
}

/** Line with end-dot, hover crosshair and tooltip. Points may carry a label (e.g. regime) for the tooltip. */
export function LineChart({ points, height = 140, min = 0, max = 100, bands = [], format = (y: number) => y.toFixed(0), color = C.seq }: { points: { x: string; y: number; label?: string }[]; height?: number; min?: number; max?: number; bands?: number[]; format?: (y: number) => string; color?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const id = useId();
  const W = 100, H = 50, n = points.length;
  const X = (i: number) => (n === 1 ? W / 2 : (i * W) / (n - 1));
  const Y = (y: number) => H - 4 - ((y - min) / (max - min)) * (H - 8);
  const d = points.map((p, i) => `${i ? "L" : "M"}${X(i)},${Y(p.y)}`).join(" ");
  const hp = hover != null ? points[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" preserveAspectRatio="none" style={{ height }} role="img" aria-label="Trend over sessions" onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const fx = ((e.clientX - r.left) / r.width) * W; let best = 0; for (let i = 1; i < n; i++) if (Math.abs(X(i) - fx) < Math.abs(X(best) - fx)) best = i; setHover(best); }}>
        {bands.map((b) => <line key={b} x1={0} x2={W} y1={Y(b)} y2={Y(b)} stroke={C.grid} strokeWidth={0.5} vectorEffect="non-scaling-stroke" />)}
        <defs><linearGradient id={id} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity={0.18} /><stop offset="1" stopColor={color} stopOpacity={0} /></linearGradient></defs>
        {n > 1 && <path d={`${d} L${X(n - 1)},${H} L${X(0)},${H} Z`} fill={`url(#${id})`} />}
        <path d={d} fill="none" stroke={color} strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
        {hp && <line x1={X(hover!)} x2={X(hover!)} y1={0} y2={H} stroke="rgb(var(--c-text))" strokeOpacity={0.35} strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        {points.map((p, i) => <circle key={p.x} cx={X(i)} cy={Y(p.y)} r={hover === i || i === n - 1 ? 1.6 : 0} fill={color} stroke="rgb(var(--c-panel))" strokeWidth={0.6} />)}
      </svg>
      {hp && <div className="pointer-events-none absolute top-1 rounded-lg bg-panel2 px-2 py-1 text-[11px] shadow-lg" style={{ left: `${Math.min(80, Math.max(0, X(hover!) - 10))}%` }}><b className="mono">{format(hp.y)}</b> · {hp.x}{hp.label ? ` · ${hp.label}` : ""}</div>}
      <div className="flex justify-between text-[10px] text-muted"><span>{points[0]?.x}</span><span>{points[n - 1]?.x}</span></div>
    </div>
  );
}

/** Grouped columns for a few sessions (e.g. longs vs shorts per run), thin marks, legend included. */
export function Columns({ groups, series, colors }: { groups: { x: string; values: number[] }[]; series: string[]; colors: string[] }) {
  const top = Math.max(1, ...groups.flatMap((g) => g.values));
  return (
    <div>
      <div className="flex h-28 items-end gap-2" role="img" aria-label={series.join(" vs ")}>
        {groups.map((g) => (
          <div key={g.x} className="flex flex-1 items-end justify-center gap-0.5" title={`${g.x}: ${series.map((s, i) => `${s} ${g.values[i]}`).join(", ")}`}>
            {g.values.map((v, i) => <span key={i} className="w-3 max-w-[24px] rounded-t-[3px]" style={{ height: `${(100 * v) / top}%`, minHeight: v ? 2 : 0, background: colors[i] }} />)}
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-2 text-[10px] text-muted">{groups.map((g) => <span key={g.x} className="flex-1 truncate text-center">{g.x.slice(5)}</span>)}</div>
      <div className="mt-2 flex gap-3 text-[11px] text-muted">{series.map((s, i) => <span key={s}><span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: colors[i] }} />{s}</span>)}</div>
    </div>
  );
}
