"""Every job records start, end, status, counters and errors to data/jobs/."""

from __future__ import annotations

import json
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from pipeline.run_writer import write_text

KEEP = 100


class JobLog:
    def __init__(self, jobs_dir: Path, job: str):
        self.dir = jobs_dir
        self.job = job
        self.started = datetime.now(timezone.utc).replace(microsecond=0)
        self._t0 = time.monotonic()
        self.counters: dict[str, Any] = {}
        self.errors: list[dict[str, Any]] = []
        self.extra: dict[str, Any] = {}

    def error(self, **kw: Any) -> None:
        self.errors.append(kw)

    def finish(self, status: str) -> Path:
        finished = datetime.now(timezone.utc).replace(microsecond=0)
        record = {
            "job": self.job,
            "started_at": self.started.isoformat(),
            "finished_at": finished.isoformat(),
            "duration_s": round(time.monotonic() - self._t0, 1),
            "status": status,
            "counters": self.counters,
            "errors": self.errors[:200],
            "n_errors": len(self.errors),
            **self.extra,
        }
        path = self.dir / f"{self.job}_{self.started.strftime('%Y%m%dT%H%M%SZ')}.json"
        write_text(path, json.dumps(record, indent=2, sort_keys=True) + "\n")
        self._update_index()
        return path

    def _update_index(self) -> None:
        files = sorted(self.dir.glob("*_*.json"), reverse=True)
        entries = []
        for f in files:
            if f.name == "index.json":
                continue
            try:
                r = json.loads(f.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                continue
            entries.append({k: r.get(k) for k in ("job", "started_at", "finished_at", "duration_s", "status", "n_errors", "run_id")} | {"counters": r.get("counters", {})})
        entries.sort(key=lambda e: e["started_at"] or "", reverse=True)
        for f in files[KEEP:]:
            f.unlink()
        write_text(self.dir / "index.json", json.dumps({"schema_version": 1, "jobs": entries[:KEEP]}, indent=2, sort_keys=True) + "\n")
