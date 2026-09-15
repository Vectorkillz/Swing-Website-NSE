// Browser-only persistence: review decisions and the trade journal live in IndexedDB.
// Nothing here is ever sent anywhere. Export/import JSON is the only backup path.

import Dexie, { type Table } from "dexie";

export type ReviewDecision = "accepted" | "rejected" | "watch";

export interface Review {
  key: string; // `${run_id}:${symbol}:${side}`
  run_id: string;
  symbol: string;
  side: "long" | "short";
  decision: ReviewDecision;
  note: string;
  updated_at: string;
}

export interface JournalExit {
  date: string;
  price: number;
  qty: number;
  kind: "partial_1" | "partial_2" | "stop" | "trail" | "target_1" | "target_2" | "manual";
}

export interface JournalTrade {
  id?: number;
  run_id: string;
  config_version: string;
  symbol: string;
  side: "long" | "short";
  sector: string | null;
  score_raw: number;
  score_max: number;
  planned_entry: number;
  planned_entry_max: number | null;
  planned_stop: number;
  planned_qty: number;
  planned_risk_amount: number;
  plan_snapshot: unknown; // full TradePlan JSON at acceptance time
  fill_price: number | null;
  fill_date: string | null;
  qty: number;
  stop: number; // current stop (may be moved to breakeven / trail)
  exits: JournalExit[];
  fees: number;
  status: "planned" | "open" | "closed";
  closed_at: string | null;
  realised_r: number | null;
  review: string;
  created_at: string;
}

export class ScannerDb extends Dexie {
  reviews!: Table<Review, string>;
  journal!: Table<JournalTrade, number>;

  constructor() {
    super("nse-swing-scanner");
    this.version(1).stores({
      reviews: "key, run_id, symbol, decision",
      journal: "++id, symbol, status, run_id, side",
    });
  }
}

export const db = new ScannerDb();

export function reviewKey(runId: string, symbol: string, side: "long" | "short"): string {
  return `${runId}:${symbol}:${side}`;
}

export function realisedR(t: JournalTrade): number | null {
  if (t.fill_price == null || t.exits.length === 0) return null;
  const riskPerShare = Math.abs(t.fill_price - t.planned_stop);
  if (riskPerShare <= 0) return null;
  const exitedQty = t.exits.reduce((s, e) => s + e.qty, 0);
  if (exitedQty <= 0) return null;
  const pnl = t.exits.reduce((s, e) => s + (t.side === "long" ? e.price - t.fill_price! : t.fill_price! - e.price) * e.qty, 0) - t.fees;
  return pnl / (riskPerShare * exitedQty);
}

export function openR(t: JournalTrade, lastClose: number | null): number | null {
  if (t.fill_price == null || lastClose == null) return null;
  const riskPerShare = Math.abs(t.fill_price - t.planned_stop);
  if (riskPerShare <= 0) return null;
  return ((t.side === "long" ? lastClose - t.fill_price : t.fill_price - lastClose) / riskPerShare);
}

export async function exportAll(): Promise<string> {
  const [reviews, journal] = await Promise.all([db.reviews.toArray(), db.journal.toArray()]);
  return JSON.stringify({ app: "nse-swing-scanner", version: 1, exportedAt: new Date().toISOString(), reviews, journal }, null, 2);
}

export async function importAll(text: string, mode: "merge" | "replace"): Promise<{ reviews: number; journal: number }> {
  const parsed = JSON.parse(text) as { reviews?: Review[]; journal?: JournalTrade[] };
  await db.transaction("rw", db.reviews, db.journal, async () => {
    if (mode === "replace") {
      await db.reviews.clear();
      await db.journal.clear();
    }
    if (parsed.reviews?.length) await db.reviews.bulkPut(parsed.reviews);
    if (parsed.journal?.length) {
      const rows = mode === "replace" ? parsed.journal : parsed.journal.map((j) => ({ ...j, id: undefined }));
      await db.journal.bulkPut(rows as JournalTrade[]);
    }
  });
  return { reviews: parsed.reviews?.length ?? 0, journal: parsed.journal?.length ?? 0 };
}
