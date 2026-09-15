import { useQuery } from "@tanstack/react-query";
import type { Candidate, ChartPayload, ConfigProfile, ConfigSchema, JobRecord, Run, RunSummary, SymbolStatus } from "./types";

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
  return useQuery({
    queryKey: ["candidates", runId],
    queryFn: () => getJson<{ candidates: Candidate[] }>(`runs/${runId}/candidates.json`),
    enabled: !!runId,
    staleTime: STALE,
  });
}

export function useSymbolStatus(runId: string | undefined) {
  return useQuery({
    queryKey: ["symbol_status", runId],
    queryFn: () => getJson<{ statuses: SymbolStatus[] }>(`runs/${runId}/symbol_status.json`),
    enabled: !!runId,
    staleTime: STALE,
  });
}

export function useChart(symbol: string | undefined) {
  return useQuery({ queryKey: ["chart", symbol], queryFn: () => getJson<ChartPayload>(`charts/${symbol}.json`), enabled: !!symbol, staleTime: STALE });
}

export function useConfigSchema() {
  return useQuery({ queryKey: ["config", "schema"], queryFn: () => getJson<ConfigSchema>("config/schema.json"), staleTime: Infinity });
}

export function useConfigVersions() {
  return useQuery({ queryKey: ["config", "versions"], queryFn: () => getJson<{ versions: string[] }>("config/profiles/index.json"), staleTime: STALE });
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

export function useUniverseStatus() {
  return useQuery({
    queryKey: ["universe", "status"],
    queryFn: () => getJson<{ as_of: string; source: string; n_symbols: number; live_error: string | null }>("universe/status.json"),
    staleTime: STALE,
    retry: false,
  });
}
