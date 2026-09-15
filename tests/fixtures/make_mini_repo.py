"""Assemble tests/fixtures/mini_repo: a local data directory the CLI can scan offline.

Run after make_fixtures.py. Output is deterministic.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

import pandas as pd

HERE = Path(__file__).parent
OUT = HERE / "mini_repo"

GOOD = dict(market_cap_cr=12000, avg_volume=900000, debt_equity=0.4, roe=18.0, revenue_growth=22.0, eps_growth=30.0,
            fcf_positive=True, fetched_at="2026-09-10T10:00:00", source="fixture")

SYMBOLS = {
    # symbol: (fixture, sector, fundamentals overrides)
    "LONGOK": ("long_vcp_ok", "Technology", {}),
    "COLOUR": ("long_colour_change", "Healthcare", {}),
    "TINY": ("long_tiny_range_ib", "Technology", {}),
    "MOTHER": ("long_mother_bar", "Industrials", {}),
    "STALE": ("long_leg_stale", "Financial Services", {}),
    "NOPULL": ("long_no_pullback", "Energy", {}),
    "WEAKROE": ("long_vcp_ok", "Technology", {"roe": 5.0}),
    "MISSDE": ("long_vcp_ok", "Technology", {"debt_equity": None}),
    "SHORTDT": ("short_stage4_downtrend", "Consumer Cyclical", {}),
    "SHORTDB": ("short_double_top", "Basic Materials", {}),
    "BANNED": ("short_double_top", "Basic Materials", {}),
    "ZERO": ("edge_zero_price", "Technology", {}),
    "GAP": ("edge_gap_sessions", "Technology", {}),
    "FEW": ("edge_too_few_bars", "Technology", {}),
}


def main() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "ohlcv" / "daily").mkdir(parents=True)
    (OUT / "ohlcv" / "index").mkdir(parents=True)
    (OUT / "fundamentals").mkdir(parents=True)
    rows = []
    for sym, (fixture, sector, over) in SYMBOLS.items():
        shutil.copy(HERE / f"{fixture}.csv", OUT / "ohlcv" / "daily" / f"{sym}.csv")
        f = {**GOOD, **over, "sector": sector, "name": f"{sym.title()} Ltd"}
        (OUT / "fundamentals" / f"{sym}.json").write_text(json.dumps(f, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
        rows.append({"symbol": sym, "name": f["name"], "sector": sector})
    pd.DataFrame(rows).to_csv(OUT / "universe.csv", index=False, lineterminator="\n")
    shutil.copy(HERE / "index_nifty_bull.csv", OUT / "ohlcv" / "index" / "NIFTY.csv")
    shutil.copy(HERE / "index_smallcap.csv", OUT / "ohlcv" / "index" / "SMALLCAP.csv")
    idx = pd.bdate_range(end="2026-09-10", periods=30)
    vix = pd.DataFrame({"open": 14.0, "high": 15.5, "low": 13.5, "close": 14.8, "volume": 0}, index=idx)
    vix.index.name = "date"
    vix.to_csv(OUT / "ohlcv" / "index" / "INDIAVIX.csv", lineterminator="\n", date_format="%Y-%m-%d")
    pd.DataFrame({"symbol": ["BANNED"]}).to_csv(OUT / "ban_list.csv", index=False, lineterminator="\n")


if __name__ == "__main__":
    main()
