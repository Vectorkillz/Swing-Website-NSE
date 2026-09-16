import { useEffect, useState } from "react";
import { useIsFetching, useQueryClient } from "@tanstack/react-query";
import { forceFresh } from "../lib/dataClient";
import { toast } from "../lib/toast";
import { IconRefresh } from "./icons";

/**
 * Re-fetches every dataset the page has loaded, bypassing the browser cache.
 * The site is static: a refresh picks up whatever the last GitHub Actions run committed.
 */
export default function RefreshButton({ compact = false }: { compact?: boolean }) {
  const qc = useQueryClient();
  const fetching = useIsFetching();
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<Date | null>(null);

  useEffect(() => {
    if (busy && fetching === 0) { setBusy(false); setLast(new Date()); toast("success", "Data refreshed", "Every loaded file was re-fetched from the published site.", 3000); }
  }, [busy, fetching]);

  async function refresh() {
    setBusy(true);
    forceFresh();
    await qc.invalidateQueries({ refetchType: "active" });
  }

  const spinning = busy || fetching > 0;
  return (
    <div className="flex items-center gap-2">
      {!compact && last && <span className="hidden text-[11px] text-muted sm:inline">refreshed {last.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>}
      <button type="button" className={`btn ${compact ? "px-3" : "btn-accent"}`} onClick={refresh} disabled={spinning} aria-label="Refresh data" aria-busy={spinning} data-testid="refresh-data">
        <IconRefresh className={spinning ? "spin" : ""} />
        {!compact && <span>{spinning ? "Refreshing…" : "Refresh data"}</span>}
      </button>
    </div>
  );
}
