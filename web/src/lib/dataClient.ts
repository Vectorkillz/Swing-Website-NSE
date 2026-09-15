import { useQueries, useQuery } from "@tanstack/react-query";
import { parseOhlcvCsv, type OhlcvBar } from "./csv";
import type { Candidate, ChartPayload, ConfigProfile, ConfigSchema, JobRecord, Run, RunSummary, SymbolStatusRow, UniverseRow } from "./types";

const BASE = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : import.meta.env.BASE_URL + "/";

export function dataUrl(path: string): string {
  return `${BASE}data/${path}`;
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(dataUrl(path), { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return (await res.json()) as T;
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
  return useQuery({ queryKey: ["chart", symbol], queryFn: () => getJson<ChartPayload>(`charts/${symbol}.json`), enabled: !!symbol, staleTime: STALE });
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
  return useQuery({ queryKey: ["jobs"], queryFn: () => getJson<{ jobs: JobRecord[] }>("jobs/index.json"), staleTime: STALE, retry: false });
}
interface UniverseStatus {
  as_of: string;
  source: string;
  n_symbols: number;
  live_error: string | null;
}

export function useUniverseStatus() {
  return useQuery({ queryKey: ["universe", "status"], queryFn: () => getJson<UniverseStatus>("universe/status.json"), staleTime: STALE, retry: false });
}

export function useEquityUniverseStatus() {
  return useQuery({ queryKey: ["universe", "equity_status"], queryFn: () => getJson<UniverseStatus>("universe/equity_status.json"), staleTime: STALE, retry: false });
}

async function getOhlcv(symbol: string): Promise<OhlcvBar[]> {
  const res = await fetch(dataUrl(`ohlcv/daily/${symbol}.csv`), { cache: "no-cache" });
  if (!res.ok) throw new Error(`ohlcv/${symbol}: HTTP ${res.status}`);
  return parseOhlcvCsv(await res.text());
}

export function useOhlcv(symbol: string | undefined) {
  return useQuery({ queryKey: ["ohlcv", symbol], queryFn: () => getOhlcv(symbol!), enabled: !!symbol, staleTime: STALE });
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
