import { useQueries, useQuery } from "@tanstack/react-query";
import { parseOhlcvCsv, type OhlcvBar } from "./csv";
import { idbGet, idbSet } from "./idb";
import { toast } from "./toast";
import type { Candidate, ChartPayload, ConfigProfile, ConfigSchema, IndexMembership, JobRecord, Run, RunSummary, SymbolStatusRow, UniverseRow } from "./types";

const BASE = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + "/";

export function dataUrl(path: string): string {
  return `${BASE}data/${path}`;
}

// ---- Cache policy -------------------------------------------------------------------------------
// Every data file is cached in IndexedDB with its fetch time. A cached copy is served without a network
// round-trip while it is "fresh": 5 minutes during NSE market hours (09:00–16:30 IST, Mon–Fri, when a
// new scan may land), 6 hours otherwise. When it is stale we fetch; if the fetch fails and a cached
// copy exists we show the cached copy and raise a toast. "Refresh data" bypasses the freshness check.
export const MARKET_HOURS_TTL_MS = 5 * 60 * 1000;
export const OFF_HOURS_TTL_MS = 6 * 60 * 60 * 1000;
let bypassUntil = 0;
export function forceFresh(ms = 15_000) { bypassUntil = Date.now() + ms; }

export function isMarketHoursIst(now = new Date()): boolean {
  const ist = new Date(now.getTime() + (330 + now.getTimezoneOffset()) * 60_000);
  const day = ist.getDay();
  const mins = ist.getHours() * 60 + ist.getMinutes();
  return day >= 1 && day <= 5 && mins >= 9 * 60 && mins <= 16 * 60 + 30;
}
export function cacheTtlMs(now = new Date()): number { return isMarketHoursIst(now) ? MARKET_HOURS_TTL_MS : OFF_HOURS_TTL_MS; }

export interface Fetched<T> { value: T; fromCache: boolean; savedAt: number }
const served: { fromCache: number; network: number; fallback: number } = { fromCache: 0, network: 0, fallback: 0 };
export function cacheStats() { return { ...served }; }

async function getText(path: string, optional = false): Promise<Fetched<string>> {
  const cached = await idbGet<string>(path);
  const now = Date.now();
  if (cached && now >= bypassUntil && now - cached.savedAt < cacheTtlMs()) { served.fromCache++; return { value: cached.value, fromCache: true, savedAt: cached.savedAt }; }
  try {
    const res = await fetch(dataUrl(path), { cache: "no-cache" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    void idbSet(path, text);
    served.network++;
    return { value: text, fromCache: false, savedAt: now };
  } catch (e) {
    if (cached) {
      served.fallback++;
      toast("warn", "Showing cached data", `${path} could not be re-fetched (${(e as Error).message}); using the copy saved ${new Date(cached.savedAt).toLocaleString("en-IN")}.`);
      return { value: cached.value, fromCache: true, savedAt: cached.savedAt };
    }
    if (!optional) toast("error", "Data file unavailable", `${path}: ${(e as Error).message}`);
    throw new Error(`${path}: ${(e as Error).message}`);
  }
}

async function getJson<T>(path: string, optional = false): Promise<T> {
  const r = await getText(path, optional);
  return JSON.parse(r.value) as T;
}

const STALE = 5 * 60 * 1000;

export function useRunIndex() {
  return useQuery({ queryKey: ["runs", "index"], queryFn: () => getJson<{ runs: RunSummary[] }>("runs/index.json"), staleTime: STALE });
}
export function useLatestRunId() {
  return useQuery({ queryKey: ["runs", "latest"], queryFn: () => getJson<{ run_id: string }>("runs/latest.json"), staleTime: STALE });
}
export function useRun(runId: string | undefined) {
  return useQuery({ queryKey: ["run", runId], queryFn: () => getJson<Run>(`runs/${runId}/run.json`), enabled: !!runId, staleTime: STALE });
}
export function useCandidates(runId: string | undefined) {
  return useQuery({ queryKey: ["candidates", runId], queryFn: () => getJson<{ candidates: Candidate[] }>(`runs/${runId}/candidates.json`), enabled: !!runId, staleTime: STALE });
}
export function useUniverse(runId: string | undefined) {
  return useQuery({ queryKey: ["universe", runId], queryFn: () => getJson<{ rows: UniverseRow[] }>(`runs/${runId}/universe.json`), enabled: !!runId, staleTime: STALE });
}
export function useSymbolStatus(runId: string | undefined) {
  return useQuery({ queryKey: ["symbol_status", runId], queryFn: () => getJson<{ statuses: SymbolStatusRow[] }>(`runs/${runId}/symbol_status.json`), enabled: !!runId, staleTime: STALE });
}
export function useChart(symbol: string | undefined) {
  return useQuery({ queryKey: ["chart", symbol], queryFn: () => getJson<ChartPayload>(`charts/${symbol}.json`, true), enabled: !!symbol, staleTime: STALE, retry: false });
}
export function useConfigSchema() {
  return useQuery({ queryKey: ["config", "schema"], queryFn: () => getJson<ConfigSchema>("config/schema.json"), staleTime: Infinity });
}
export function useActiveConfigVersion() {
  return useQuery({ queryKey: ["config", "active"], queryFn: () => getJson<{ active: string }>("config/active.json"), staleTime: STALE });
}
export function useConfigProfile(version: string | undefined) {
  return useQuery({ queryKey: ["config", "profile", version], queryFn: () => getJson<ConfigProfile>(`config/profiles/${version}.json`), enabled: !!version, staleTime: Infinity });
}
export function useJobs() {
  return useQuery({ queryKey: ["jobs"], queryFn: () => getJson<{ jobs: JobRecord[] }>("jobs/index.json", true), staleTime: STALE, retry: false });
}
interface UniverseStatus {
  as_of: string;
  source: string;
  n_symbols: number;
  live_error: string | null;
}

export function useUniverseStatus() {
  return useQuery({ queryKey: ["universe", "status"], queryFn: () => getJson<UniverseStatus>("universe/status.json", true), staleTime: STALE, retry: false });
}

export function useEquityUniverseStatus() {
  return useQuery({ queryKey: ["universe", "equity_status"], queryFn: () => getJson<UniverseStatus>("universe/equity_status.json", true), staleTime: STALE, retry: false });
}

export function useIndexMembership() {
  return useQuery({ queryKey: ["universe", "index_membership"], queryFn: () => getJson<IndexMembership>("universe/index_membership.json", true), staleTime: Infinity, retry: false });
}

async function getOhlcv(symbol: string): Promise<OhlcvBar[]> {
  const r = await getText(`ohlcv/daily/${symbol}.csv`, true);
  return parseOhlcvCsv(r.value);
}

export function useOhlcv(symbol: string | undefined) {
  return useQuery({ queryKey: ["ohlcv", symbol], queryFn: () => getOhlcv(symbol!), enabled: !!symbol, staleTime: STALE, retry: false });
}

/** Batched fetch for the outcome tracker, which needs many symbols' bars at once. */
export function useOhlcvBatch(symbols: string[]) {
  return useQueries({
    queries: symbols.map((s) => ({ queryKey: ["ohlcv", s], queryFn: () => getOhlcv(s), staleTime: STALE, retry: false })),
  });
}

export function useRunCandidates(runIds: string[]) {
  return useQueries({
    queries: runIds.map((id) => ({ queryKey: ["candidates", id], queryFn: () => getJson<{ candidates: Candidate[] }>(`runs/${id}/candidates.json`), staleTime: STALE, retry: false })),
  });
}

export function useLatestRun(runIdOverride?: string) {
  const latest = useLatestRunId();
  const runId = runIdOverride ?? latest.data?.run_id;
  const run = useRun(runId);
  return { runId, run, latest };
}
