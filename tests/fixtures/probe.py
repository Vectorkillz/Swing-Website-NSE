"""Dev helper: print detector outcomes for every fixture. Not a test."""

from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from engine.config import load_profile  # noqa: E402
from engine.detectors import colour_change, detect_bar_pattern, momentum_leg, short_signals, vcp  # noqa: E402
from engine.indicators import add_indicators  # noqa: E402
from engine.quality import check_daily  # noqa: E402
from engine.regime import classify_regime  # noqa: E402
from engine.scoring import LongFeatures, score_long, score_short  # noqa: E402

HERE = Path(__file__).parent
_, CFG = load_profile(Path(__file__).resolve().parents[2] / "config" / "profiles" / "v001.json")
SESSION = pd.Timestamp("2026-09-10").date()


def load(name: str) -> pd.DataFrame:
    return pd.read_csv(HERE / f"{name}.csv", index_col="date", parse_dates=True)


for p in sorted(HERE.glob("*.csv")):
    name = p.stem
    df = load(name)
    q = check_daily(df, SESSION, CFG)
    print(f"\n=== {name}: bars={len(df)} quality={q or 'ok'}")
    if q or name.startswith("index_"):
        if name.startswith("index_"):
            r = classify_regime(df, 15.0, None, CFG)
            print("  regime:", r.regime.value, f"close={r.nifty_close:.0f} e10={r.nifty_ema_fast:.0f} e20={r.nifty_ema_slow:.0f} roc={r.roc_18m}")
        continue
    d = add_indicators(df)
    leg = momentum_leg(d, CFG)
    print(f"  leg: found={leg.found} move={leg.move_pct} daily={leg.max_daily_pct} age={leg.age_bars} rej={leg.rejected_reason}")
    v = vcp(d, leg, CFG)
    print(f"  vcp: valid={v.valid} depth={v.depth_pct} vol={v.vol_dry_pct} a20={v.above_ema20} stage2={v.stage2}")
    bp = detect_bar_pattern(d, CFG)
    cc = colour_change(d)
    print(f"  bar={bp.kind} trigger={bp.trigger} colour={cc}")
    if leg.found:
        sc = score_long(LongFeatures(leg, v, bp, cc, None, None), CFG)
        print(f"  long score raw={sc.raw} (technical only)")
    s = short_signals(d, CFG)
    if s:
        print(f"  short: stage4={s.stage4} dt={s.downtrend} dbl={s.double_top} weak={s.weak_bounce}({s.bounce_ratio}) lowvol={s.low_vol_bounce} red={s.red_confirm} score={score_short(s, CFG).raw}")
