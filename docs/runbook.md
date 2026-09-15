# Runbook

## Daily flow (automatic)

1. `Daily scan` workflow fires at 11:00 UTC (16:30 IST) Monday to Friday.
2. `calendar-check` skips NSE holidays listed in `data/calendar/nse_holidays_YYYY.csv`.
3. `ingest` pulls delta OHLCV via yfinance (batches of 50, backoff, overlap re-check for splits).
4. `run-scan` fetches the ban list (NSE archive CSV, falls back to `data/ban_list/`), builds inputs from `data/`, runs the pure engine, writes `data/runs/{run_id}/`, `data/charts/`, `data/jobs/`.
5. The bot commits `data/` with `[skip ci]` and the same workflow builds and deploys the site to GitHub Pages.

Site URL: `https://<github-user>.github.io/<repo-name>/`

## First-time setup on GitHub

1. Push this repository to GitHub (default branch `main`).
2. Settings → Pages → Source: **GitHub Actions**.
3. Settings → Actions → General → Workflow permissions: **Read and write**.
4. Run `Refresh universe`, then `Refresh fundamentals` (all four shards), then `Daily scan` via *Run workflow*. The committed `data/` from the local bootstrap already contains a universe, fundamentals, OHLCV and one run, so the site is populated on the first deploy.

## Manual operations

| Task | Command (local, from repo root, venv active) |
|---|---|
| Scan a specific session | `python -m pipeline.cli run-scan --date YYYY-MM-DD` |
| Re-run with another config | commit `config/profiles/vNNN.json`, set `config/active.json`, then `run-scan` (or dispatch the workflow) |
| Full OHLCV refetch | `python -m pipeline.cli ingest --full` |
| Upload universe manually | edit `data/universe/fno_universe.csv` (symbol,name,sector,industry,isin,lot_size) and `status.json` (`as_of`, `source: manual_csv`) |
| Upload ban list manually | `data/ban_list/YYYY-MM-DD.csv` with a `symbol` column, dated by the trade date it applies to |
| Add holidays | append to `data/calendar/nse_holidays_YYYY.csv` |
| Regenerate config schema for the site | `python -m pipeline.cli export-schema` |
| Regenerate TS test vectors after changing `engine/portfolio.py` | `python -m pipeline.cli export-vectors` |
| Update golden scan output after an intentional engine change | `pytest --update-golden` and review the diff |

## Failure modes and what the app does

| Symptom | Behaviour |
|---|---|
| yfinance returns nothing for a symbol | symbol recorded `data_unavailable`, run continues; below 90% coverage the run is `degraded` |
| VIX missing | regime `UNKNOWN`, no scan, run status `no_scan_regime_unknown` |
| nseindia.com blocked | universe stays on the committed CSV (stale warning after 7 days); ban list falls back to `data/ban_list/`; if none applies, no short plans (`require_ban_list`) |
| Split or bonus changes history | overlap check detects >0.5% divergence, full refetch for that symbol, logged in the job |
| Holiday not in calendar | ingestion finds stale bars, symbols fail `stale_last_bar`, run is `degraded` rather than producing plans from stale data |
| Bot commit does not trigger Pages | expected (GITHUB_TOKEN commits do not trigger push workflows); the scan workflow deploys itself |

## Data growth

About 210 CSVs of 3 years each (~45 KB) plus one run directory (~1 MB with charts) per session. `keep_runs` prunes run directories; git history retains the rest. Plan an annual history squash if the repo passes ~1 GB.

## Backup

The review decisions and journal live only in the browser. Use Journal → Export JSON regularly and keep the file outside the repo.
