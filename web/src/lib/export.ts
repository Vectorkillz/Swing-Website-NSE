// CSV / JSON download helpers. Values are plain data already shown on screen.

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0) return "";
  const cols = columns ?? Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n") + "\n";
}

export function download(filename: string, content: string, mime: string): void {
  try {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.rel = "noopener";
    document.body.appendChild(a); a.click(); a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch { /* sandboxed viewer: downloads are inert */ }
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[], columns?: string[]) { download(filename, toCsv(rows, columns), "text/csv;charset=utf-8"); }
export function downloadJson(filename: string, data: unknown) { download(filename, JSON.stringify(data, null, 1), "application/json"); }
