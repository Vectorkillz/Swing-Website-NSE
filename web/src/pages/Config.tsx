import { useEffect, useMemo, useState } from "react";
import { useActiveConfigVersion, useConfigProfile, useConfigSchema, useConfigVersions } from "../lib/dataClient";
import type { ConfigSchema } from "../lib/types";
import { Card, Empty, Loading, Warn } from "../components/ui";

type Prop = ConfigSchema["properties"][string];

function typeOf(p: Prop): "boolean" | "number" | "integer" | "string" | "enum" | "nullable-number" {
  if (p.enum) return "enum";
  if (p.anyOf) {
    const types = p.anyOf.map((a) => a.type);
    if (types.includes("string") && p.anyOf.some((a) => a.enum)) return "enum";
    if (types.includes("null")) return "nullable-number";
  }
  const t = Array.isArray(p.type) ? p.type[0] : p.type;
  if (t === "boolean") return "boolean";
  if (t === "integer") return "integer";
  if (t === "number") return "number";
  return "string";
}

function rangeText(p: Prop): string {
  const parts: string[] = [];
  if (p.minimum != null) parts.push(`≥ ${p.minimum}`);
  if (p.exclusiveMinimum != null) parts.push(`> ${p.exclusiveMinimum}`);
  if (p.maximum != null) parts.push(`≤ ${p.maximum}`);
  if (p.exclusiveMaximum != null) parts.push(`< ${p.exclusiveMaximum}`);
  return parts.join(", ");
}

function validate(p: Prop, v: unknown): string | null {
  const t = typeOf(p);
  if (v === null || v === "") return t === "nullable-number" ? null : "required";
  if (t === "number" || t === "integer" || t === "nullable-number") {
    const n = Number(v);
    if (Number.isNaN(n)) return "not a number";
    if (t === "integer" && !Number.isInteger(n)) return "must be an integer";
    if (p.minimum != null && n < p.minimum) return `must be ≥ ${p.minimum}`;
    if (p.exclusiveMinimum != null && n <= p.exclusiveMinimum) return `must be > ${p.exclusiveMinimum}`;
    if (p.maximum != null && n > p.maximum) return `must be ≤ ${p.maximum}`;
    if (p.exclusiveMaximum != null && n >= p.exclusiveMaximum) return `must be < ${p.exclusiveMaximum}`;
  }
  return null;
}

export default function ConfigPage() {
  const schema = useConfigSchema();
  const versions = useConfigVersions();
  const active = useActiveConfigVersion();
  const [left, setLeft] = useState<string | undefined>();
  const [right, setRight] = useState<string | undefined>();
  useEffect(() => { if (active.data && !left) setLeft(active.data.active); }, [active.data, left]);
  const base = useConfigProfile(left);
  const other = useConfigProfile(right);
  const [draft, setDraft] = useState<Record<string, unknown> | null>(null);
  const [filter, setFilter] = useState("");

  const groups = useMemo(() => {
    if (!schema.data) return [];
    const map = new Map<string, string[]>();
    for (const [k, p] of Object.entries(schema.data.properties)) {
      const g = p["x-group"] ?? "other";
      if (filter && !`${k} ${p.description ?? ""}`.toLowerCase().includes(filter.toLowerCase())) continue;
      map.set(g, [...(map.get(g) ?? []), k]);
    }
    return Array.from(map.entries());
  }, [schema.data, filter]);

  if (!schema.data || !versions.data) return <Loading what="config schema" />;
  const values = draft ?? (base.data?.values ?? {});
  const errors = Object.fromEntries(Object.entries(schema.data.properties).map(([k, p]) => [k, draft ? validate(p, draft[k]) : null]));
  const nErrors = Object.values(errors).filter(Boolean).length;
  const nextVersion = `v${String(Math.max(0, ...versions.data.versions.map((v) => Number(v.replace(/\D/g, "")) || 0)) + 1).padStart(3, "0")}`;
  const changed = draft && base.data ? Object.keys(draft).filter((k) => JSON.stringify(draft[k]) !== JSON.stringify(base.data!.values[k])) : [];

  function setField(k: string, raw: string | boolean, p: Prop) {
    const t = typeOf(p);
    let v: unknown = raw;
    if (t === "boolean") v = Boolean(raw);
    else if (t === "nullable-number") v = raw === "" ? null : Number(raw);
    else if (t === "number" || t === "integer") v = raw === "" ? "" : Number(raw);
    setDraft({ ...(draft ?? base.data?.values ?? {}), [k]: v });
  }

  function download() {
    if (!draft) return;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(schema.data!.properties)) out[k] = draft[k];
    const blob = new Blob([JSON.stringify(out, null, 2) + "\n"], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${nextVersion}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="space-y-4">
      <Warn level="info">Config is versioned data. The site cannot write to the repository: edit here, download <code>{nextVersion}.json</code>, commit it to <code>config/profiles/</code> and point <code>config/active.json</code> at it. The next scan records the version it used.</Warn>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label>Base <select className="input w-auto" value={left ?? ""} onChange={(e) => { setLeft(e.target.value); setDraft(null); }}>{versions.data.versions.map((v) => <option key={v} value={v}>{v}{v === active.data?.active ? " (active)" : ""}</option>)}</select></label>
        <label>Diff against <select className="input w-auto" value={right ?? ""} onChange={(e) => setRight(e.target.value || undefined)}><option value="">—</option>{versions.data.versions.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
        <input className="input w-48" placeholder="Filter fields" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <span className="ml-auto text-xs text-muted">{base.data && `hash ${base.data.config_hash.slice(0, 12)}`}</span>
        {draft && <button className="btn" onClick={() => setDraft(null)}>Discard draft</button>}
        <button className="btn btn-primary" disabled={!draft || nErrors > 0 || changed.length === 0} onClick={download} title={nErrors ? `${nErrors} invalid fields` : changed.length === 0 ? "no changes" : ""}>Create new version → download {nextVersion}.json</button>
      </div>
      {draft && changed.length > 0 && (
        <Card title={`Draft changes vs ${left} (${changed.length})`}>
          <table className="data"><thead><tr><th>Field</th><th>From</th><th>To</th></tr></thead><tbody>{changed.map((k) => <tr key={k}><td>{k}</td><td className="mono">{JSON.stringify(base.data?.values[k])}</td><td className="mono">{JSON.stringify(draft[k])}</td></tr>)}</tbody></table>
        </Card>
      )}
      {groups.length === 0 && <Empty>No fields match.</Empty>}
      {groups.map(([g, keys]) => (
        <Card key={g} title={g}>
          <div className="grid gap-3 md:grid-cols-2">
            {keys.map((k) => {
              const p = schema.data!.properties[k];
              const t = typeOf(p);
              const v = values[k];
              const diff = other.data && JSON.stringify(other.data.values[k]) !== JSON.stringify(base.data?.values[k]);
              const enumVals = p.enum ?? p.anyOf?.find((a) => a.enum)?.enum;
              return (
                <div key={k} className={`rounded border p-2 ${errors[k] ? "border-short" : diff ? "border-warn" : "border-line"}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <label htmlFor={`f-${k}`} className="mono text-sm">{k}</label>
                    <span className="text-xs text-muted">{p["x-unit"]}{rangeText(p) ? ` · ${rangeText(p)}` : ""}</span>
                  </div>
                  <div className="my-1 text-xs text-muted">{p.description}</div>
                  {t === "boolean" ? (
                    <input id={`f-${k}`} type="checkbox" checked={Boolean(v)} onChange={(e) => setField(k, e.target.checked, p)} />
                  ) : t === "enum" ? (
                    <select id={`f-${k}`} className="input" value={String(v ?? "")} onChange={(e) => setField(k, e.target.value, p)}>{(enumVals ?? []).map((o) => <option key={String(o)} value={String(o)}>{String(o)}</option>)}</select>
                  ) : (
                    <input id={`f-${k}`} className="input mono" value={v == null ? "" : String(v)} placeholder={t === "nullable-number" ? "null (disabled)" : ""} onChange={(e) => setField(k, e.target.value, p)} inputMode="decimal" />
                  )}
                  {errors[k] && <div className="text-xs text-short">{errors[k]}</div>}
                  {diff && <div className="text-xs text-warn">{right}: <span className="mono">{JSON.stringify(other.data?.values[k])}</span></div>}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
