import { useLatestRunId, useRun } from "./dataClient";

export function useLatestRun(runIdOverride?: string) {
  const latest = useLatestRunId();
  const runId = runIdOverride ?? latest.data?.run_id;
  const run = useRun(runId);
  return { runId, run, latest };
}
