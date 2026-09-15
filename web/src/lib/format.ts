// Every displayed number carries its unit. These helpers are the only formatters used in the UI.

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function fmtInr(x: number | null | undefined, decimals: 0 | 2 = 2): string {
  if (x == null || Number.isNaN(x)) return "—";
  return `₹${decimals === 0 ? inr.format(x) : inr2.format(x)}`;
}

export function fmtPct(x: number | null | undefined, digits = 1): string {
  if (x == null || Number.isNaN(x)) return "—";
  return `${x.toFixed(digits)}%`;
}

export function fmtNum(x: number | null | undefined, digits = 0): string {
  if (x == null || Number.isNaN(x)) return "—";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: digits }).format(x);
}

export function fmtR(x: number | null | undefined): string {
  if (x == null || Number.isNaN(x)) return "—";
  return `${x >= 0 ? "+" : ""}${x.toFixed(2)}R`;
}

export function fmtPts(x: number | null | undefined): string {
  if (x == null) return "—";
  return `${x.toFixed(0)} pts`;
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 10);
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }) + " IST";
}

export function ageDays(iso: string | null | undefined, now = new Date()): number | null {
  if (!iso) return null;
  return Math.floor((now.getTime() - new Date(iso).getTime()) / 86400000);
}
