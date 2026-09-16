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

## Deploying to GitHub Pages

1. Create an empty GitHub repository and push this repo to its `main` branch.
2. Settings → Pages → Build and deployment → Source: **GitHub Actions**.
3. Settings → Actions → General → Workflow permissions: **Read and write permissions**.
4. Actions → *Deploy site* → Run workflow. The site appears at `https://<user>.github.io/<repo>/`.
5. The *Daily scan* workflow then runs every trading day at 16:30 IST and redeploys.

See `docs/runbook.md` for manual operations and failure modes.

## Local web development

```powershell
cd web
npm install
# stage the committed data into the dev server
Copy-Item -Recurse ..\data public\data
npm run dev          # http://localhost:5173
npm test -- --run    # vitest: TS portfolio port vs shared vectors
npm run build; npx playwright test
```

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

## v2 changes (2026-09-15, owner request)

* **Price levels only.** Position sizing, capital, portfolio caps and the journal were removed
  from the engine and the UI. A plan is: entry zone (with a do-not-chase upper bound), stop
  loss, target and an extended target. Stop-distance floor and level ordering invariants remain.
* **Target rule.** Structure-based with a 1R floor: long target = momentum-leg high, short target
  = lowest low of the last 20 bars; if that level is inside 1R or on the wrong side of entry the
  target is 2R. The card shows the resulting reward:risk.
* **Market-cap buckets** (Large / Mid / Small / Micro) from editable thresholds in config.
* **Multibagger potential tag** (heuristic, not backtested): Stage 2, above SMA150, 30%+ above
  the 52-week low, within 25% of the 52-week high, positive relative strength, not large cap;
  "strong" additionally needs revenue growth ≥ 20% or EPS growth ≥ 25%.
* **Universe screen**: every F&O stock with trend stage, RS, ATR%, distance from 52-week high,
  swing-tradability (volume and ATR range) and the multibagger tag.
* UI reduced to three pages: Scanner, Universe, Data. Config schema is v2 (`config/profiles/v002.json`).

## v3 changes (2026-09-16, owner request)

* **Fixed the missing-data policy.** Diagnosed the long-side shortage: on a quiet, low-momentum
  session, 110 of 211 F&O stocks were rejected before pattern detection even ran, 23 of them
  purely because debt/equity data was *missing* (not bad). `treat_missing_fundamental_as` default
  changed from `reject` to `exclude` (profile `v003`) — a stock with incomplete fundamentals is now
  reported separately as `fundamentals_missing`, not counted as a failed gate. The deeper cause on
  that date was that zero stocks in the 211-name F&O universe had both a momentum leg *and* a valid
  VCP pullback simultaneously — a genuine "no long setups today" outcome, not a bug.
* **Long-side universe expanded** to the full ~2,300-symbol NSE cash-equity list (`data/universe/nse_equity_list.csv`,
  refreshed weekly by a new `Refresh equity list` workflow from the official NSE archive). The
  ~211-symbol F&O list is unchanged and still the *only* universe shorts are generated from — cash
  equities can't be shorted on NSE the way F&O names can. Every `SymbolInput` and `UniverseRow`
  carries an `fno_eligible` flag; the short path is skipped entirely for `fno_eligible=False` rows.
* **Deterministic quality grade** (A++ / A+ / A / B+ / B) replaces nothing that existed before, but
  explicitly does *not* use the score→percentage formula the original notebook used (`score*0.6 +
  regime bonus, clamped 20–88%, labelled "probability"`) — that pattern has no empirical backing and
  was the one thing this project's build document banned from the start. The grade is instead a
  transparent function of raw score, regime alignment, and (for longs only) fundamentals strength;
  see `engine/grading.py`. Every grade a user sees comes with a `reasons` list.
* **v4 UI (2026-09-16)**: bento-grid dark theme (`#0F0F12` ground, `#00E676` bullish / `#FF334B` bearish),
  inline SVG icons, column-level sort on every numeric column (click a header to sort highest-to-lowest,
  again to flip; setup cards have a matching sort bar), a "Refresh data" button that re-fetches every
  loaded JSON/CSV with a spinning state, a new **Optionable Swing Moves** tab (F&O names only: full
  setups plus a momentum screen where trend, RS and 20-bar move agree), and a slide-over drawer on every
  card and universe row with a plain-language summary and technical reasoning built from the stored
  detector fields (`web/src/lib/reasoning.ts`). Nothing is inferred client-side beyond restating engine output.
* **v4.1 (2026-09-16)** — production-readiness pass:
  * *Data layer*: every file the site reads is cached in IndexedDB with a stale-while-revalidate
    policy (5 min during NSE hours, 6 h otherwise); a failed re-fetch falls back to the cached copy
    with a toast; "Refresh data" bypasses the cache (`web/src/lib/dataClient.ts`, `idb.ts`, `toast.tsx`).
    The site still reads only pipeline-committed files — no client-side calls to Yahoo or proxies.
  * *Tables*: sticky header + sticky symbol column, dense rows, multi-column sort (shift-click adds a
    key), fuzzy search across symbol/company/sector, scope pills for Nifty 50 / Nifty 200 / Smallcap 250
    (from `data/universe/index_membership.json`, refreshed weekly by `refresh-index-membership`), F&O and
    watchlist. CSV/JSON export of whatever is on screen.
  * *Charts*: EMA 20/50/200 + SMA150 toggles, anchored VWAP from daily bars (labelled as such), a synced
    RSI(14) pane. Raw-bar charts compute indicators in-browser with the engine's definitions.
  * *Screeners page*: Volume breakout (≥2× 20-day volume and close above the prior 20-day high), EMA
    pullback (Stage 2, within 3% of EMA20/50, RSI ≥ 50), Custom rules (price range, min volume, sector,
    trend alignment incl. higher-highs/higher-lows, cap, RSI band). Powered by new per-symbol fields on
    `UniverseRow.context`: `rsi14`, `vol_ratio_20`, `dist_ema20_pct`, `dist_ema50_pct`,
    `pct_from_20d_high`, `higher_highs_lows`.
  * *Optionable tab*: the Upward / Downward momentum tiles are buttons that filter and scroll to the list.
  * *Watchlist*: star any symbol (localStorage), filter by it everywhere, export it with the rows.
  * *Theme*: dark default, light toggle (CSS variables), persisted. Legal footer on every page.
  * *Pipeline fix*: rescanning a past session now truncates every price series at that session; before,
    every symbol failed the future-bar check and the rerun came out empty.
* **Track record page**: pick a lookback window (this week / 2 weeks / month) and see every past
  session's published setups checked against what the price actually did since — stopped out,
  target hit, on track, or not yet triggered. Computed entirely client-side from already-published
  run and price data; no new backend, no fabricated history.
* Raw daily OHLCV CSVs are now also copied into the deployed site (`data/ohlcv/`) so the browser can
  do this kind of after-the-fact price-history check without a new API.

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
* **NSE sources.** The notebook's `equity-stockIndices?index=SECURITIES IN F&O` and ban-list API
  paths return 404 (verified 2026-09-12). The universe now comes from the NSE archive
  `fo_mktlots.csv` (with lot sizes, `master-quote` as a second source) and the ban list from
  `fo_secban.csv`, which carries the trade date it applies to. Both still fall back to committed CSVs.
* **Derived ROE.** yfinance omits `returnOnEquity` for most NSE names (174 of 210 in the first
  live refresh) while providing net income, book value per share and shares outstanding. The
  provider derives ROE from those and records `roe_source = "derived:..."` on the record. This is a
  computation on provider data, not a default; a symbol without the inputs still reads MISSING.
* **Smallcap confirmation.** Yahoo no longer serves a Nifty Smallcap 100 series (`^CNXSC` returns
  one stale bar). The regime banner reports it as unavailable. It is display-only unless
  `require_smallcap_confirmation_for_bull` is enabled.
* **Portable tooling.** Development here used a per-user Node zip and a per-user Git install
  because the machine has no admin rights; nothing in the repo depends on that.

## Phase status

| Phase | Status |
|---|---|
| 1. Engine, config, tests, offline CLI | done |
| 2. Ingestion (yfinance), GitHub Actions, React site on Pages | built and verified locally; awaiting first push and Pages deploy |
| 3. Backtest and calibration | pending |
| 4. Hardening | pending |

## Non-goals

No order placement, no broker execution, no machine learning on the score, no intraday data,
no public sign-up, no news or sentiment inputs, and no claim anywhere that the output predicts
price movement.
