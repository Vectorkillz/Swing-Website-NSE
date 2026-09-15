# NSE Swing Scanner

End-of-day, rule-based swing setup scanner for NSE F&O equities, built to be hosted
entirely on GitHub: a pure Python engine, a GitHub Actions pipeline that commits JSON
results into this repo, and a static React site served from GitHub Pages.

The app surfaces **rule-match output**: setups matched, rule scores, and trade plans.
It does not place orders and it does not claim to predict price movement.

```
market regime -> universe -> eligibility gates -> pattern detection
              -> scoring   -> trade plan (entry / stop / size / exits)
              -> ranked watchlist -> review + journal (browser)
```

## Repository layout

| Path | What it is |
|---|---|
| `engine/` | Pure domain library. pandas + numpy + pydantic only. No I/O, no network, no printing. |
| `engine/detectors/` | Momentum leg, VCP, inside/mother bar, colour change, relative strength, short signals. |
| `engine/config.py` | `ScanConfig`: every threshold, with unit and description. Profiles live in `config/profiles/`. |
| `pipeline/` | CLI and jobs that do I/O (local CSV now; yfinance + Actions in Phase 2). |
| `config/profiles/vNNN.json` | Immutable versioned config. `config/active.json` names the active one. |
| `data/` | Committed pipeline outputs read by the site (runs, charts, config schema, test vectors). |
| `tests/` | pytest suite: indicators, detectors, scoring, risk, portfolio, regime, quality, hypothesis invariants, golden scan. |
| `tests/fixtures/` | Deterministic synthetic OHLCV CSVs (`make_fixtures.py`) and an offline `mini_repo/` the CLI can scan. |
| `reference/` | The original Colab notebook. Read-only, never imported. |
| `web/` | React + TypeScript site (Phase 2). |
| `docs/` | Data contract, runbook, config versioning. |

## Quick start (Phase 1: engine + CLI, offline)

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e ".[dev]"
.\.venv\Scripts\python.exe -m pytest -q
.\.venv\Scripts\python.exe -m pipeline.cli scan --data tests\fixtures\mini_repo --out .\out\runs
.\.venv\Scripts\python.exe -m pipeline.cli export-schema
.\.venv\Scripts\python.exe -m pipeline.cli export-vectors
```

Running the same scan twice yields byte-identical files. The run id embeds the session
date, the config version and the first 8 hex characters of the input hash.

## Assumptions (Section 14 answers)

These were confirmed with the owner before implementation.

1. **Thresholds** (profile `v001`, notebook defaults): capital 5,00,000 INR; risk per trade 2%;
   min market cap 500 Cr; min avg volume 300,000; **max debt/equity 2.5 as a ratio** (yfinance
   reports percentage points and the provider divides by 100); min ROE 10%; min revenue growth 8%;
   min EPS growth 10%; min momentum 20%; min daily candle 6.5%; VCP depth 8–25%; volume dry-up
   < 50%; min score 60 long / 60 short; top 5 / 5; partial exits 25% / 25%; ROC bull band 0–45;
   VIX suppress 25; stop 2.5% / 1.5 x ATR14. New spec defaults: stop-distance floor 1.0%, position
   cap 20% of capital, gross exposure cap 100%, portfolio risk cap 10%, max 6 concurrent positions,
   max 2 per sector, pyramiding off, RS lookback 20 bars with score weight 0, missing fundamentals
   → reject, ban list required, universe coverage 90%, calibration after 100 closed trades, bands
   A ≥ 85 / B ≥ 70 / C.
2. **Deployment:** GitHub Pages (static) + GitHub Actions (scheduler and data pipeline). There is no
   server, database or job queue. Actions runners usually cannot reach nseindia.com, so the
   universe and ban list degrade to committed CSV snapshots with visible staleness.
3. **Data provider:** yfinance only. The owner accepts that `Ticker.info` is undocumented, has
   inconsistent fundamental vintage and no stability guarantee.
4. **Promoter holding / pledge:** not gated in v1 (no source). Config keys are reserved as null.
5. **Users / residency:** single user. Review decisions and the journal live only in the browser
   (IndexedDB) with JSON export/import. No tokens, no sync.
6. **Shorts:** enabled in v1.
7. **Reference behaviours preserved behind flags (defaults match the notebook):**
   `allow_shorts_in_bull_high_vix=false` (7.2), `max_leg_age_bars=null` (7.5),
   `weak_bounce_method="single_bar_high"` (7.6; `swing_high` available),
   `clip_score_display_at_100=true` (7.10; raw and normalised are stored unclipped).
8. **entry_max (7.12):** enforced as a do-not-chase limit. Long sizing uses `entry_max` as the
   worst-case fill so risk never exceeds the budget; the journal will warn on fills above it.

## Deviations from the build document

* **Stack.** FastAPI, PostgreSQL, Celery and Docker are replaced by GitHub Actions + committed JSON
  + a static site, at the owner's request (GitHub Pages hosting). The pure-engine, versioned
  config, determinism, no-fabricated-data and safety-invariant requirements are kept in full.
* **Portfolio constraints against open positions.** The pipeline cannot see the browser journal,
  so it applies constraints with an empty open-position set and records `open_positions_applied: 0`.
  The site re-applies the identical algorithm (TypeScript port, verified against
  `data/test_vectors/portfolio_constraints.json`) using the local journal.
* **Weekly bars** are resampled from the stored daily history (weeks ending Friday) rather than
  fetched separately, so daily and weekly series can never disagree.
* **Indicators.** EMA is SMA-seeded (pandas_ta default); ATR uses Wilder smoothing with an SMA
  seed. Values are unit-tested against hand-computed tables, not against pandas_ta.

## Phase status

| Phase | Status |
|---|---|
| 1. Engine, config, tests, offline CLI | done |
| 2. Ingestion (yfinance), GitHub Actions, React site on Pages | pending |
| 3. Backtest and calibration | pending |
| 4. Hardening | pending |

## Non-goals

No order placement, no broker execution, no machine learning on the score, no intraday data,
no public sign-up, no news or sentiment inputs, and no claim anywhere that the output predicts
price movement.
