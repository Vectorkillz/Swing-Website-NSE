from engine.context import cap_bucket, multibagger_tag, price_context, stage_label, swing_suitability
from engine.indicators import add_indicators
from engine.types import CapBucket, Fundamentals, MultibaggerLevel


def test_cap_buckets(cfg):
    assert cap_bucket(None, cfg) is CapBucket.UNKNOWN
    assert cap_bucket(150000, cfg) is CapBucket.LARGE
    assert cap_bucket(100000, cfg) is CapBucket.LARGE
    assert cap_bucket(50000, cfg) is CapBucket.MID
    assert cap_bucket(10000, cfg) is CapBucket.SMALL
    assert cap_bucket(1000, cfg) is CapBucket.MICRO


def test_price_context_and_stage(fx):
    df = add_indicators(fx("long_vcp_ok"))
    ctx = price_context(df)
    assert ctx.high_52w >= df["close"].iloc[-1] >= ctx.low_52w
    assert ctx.pct_from_52w_high <= 0 and ctx.pct_above_52w_low >= 0
    assert ctx.atr_pct is not None and ctx.atr_pct > 0
    assert stage_label(df) == "stage2"
    assert stage_label(add_indicators(fx("short_stage4_downtrend"))) == "stage4"


def test_price_context_screener_fields(fx):
    df = add_indicators(fx("long_vcp_ok"))
    ctx = price_context(df)
    assert ctx.rsi14 is not None and 0.0 <= ctx.rsi14 <= 100.0
    assert ctx.vol_ratio_20 is not None and ctx.vol_ratio_20 > 0
    assert ctx.dist_ema20_pct is not None and ctx.dist_ema50_pct is not None
    prior_high = df["high"].iloc[-21:-1].max()
    assert abs(ctx.pct_from_20d_high - (df["close"].iloc[-1] / prior_high - 1.0) * 100.0) < 1e-9
    assert ctx.higher_highs_lows in (True, False)


def test_rsi_wilder_hand_values():
    import pandas as pd
    from engine.indicators import rsi_wilder

    up = pd.Series([float(i) for i in range(1, 30)])
    assert rsi_wilder(up, 14).iloc[-1] == 100.0
    flat_then_down = pd.Series([10.0] * 15 + [9.0] * 15)
    r = rsi_wilder(flat_then_down, 14)
    assert r.iloc[14] == 50.0  # no gains, no losses in the seed window
    assert r.iloc[-1] < 50.0
    assert rsi_wilder(pd.Series([1.0, 2.0]), 14).isna().all()


def test_multibagger_tag_levels(fx, cfg):
    df = add_indicators(fx("long_vcp_ok"))
    ctx = price_context(df)
    growth = Fundamentals(revenue_growth=30.0, eps_growth=40.0)
    strong = multibagger_tag(df, ctx, rs_vs_nifty=5.0, f=growth, bucket=CapBucket.MID, cfg=cfg)
    assert strong.level is MultibaggerLevel.STRONG and strong.technical_met == strong.technical_total
    watch = multibagger_tag(df, ctx, rs_vs_nifty=5.0, f=Fundamentals(revenue_growth=5.0, eps_growth=5.0), bucket=CapBucket.MID, cfg=cfg)
    assert watch.level is MultibaggerLevel.WATCH
    large = multibagger_tag(df, ctx, rs_vs_nifty=5.0, f=growth, bucket=CapBucket.LARGE, cfg=cfg)
    assert large.level is MultibaggerLevel.NONE and large.criteria["not_large_cap"] is False
    weak_rs = multibagger_tag(df, ctx, rs_vs_nifty=-1.0, f=growth, bucket=CapBucket.MID, cfg=cfg)
    assert weak_rs.level is MultibaggerLevel.NONE
    down = multibagger_tag(add_indicators(fx("short_stage4_downtrend")), price_context(add_indicators(fx("short_stage4_downtrend"))), 5.0, growth, CapBucket.MID, cfg)
    assert down.level is MultibaggerLevel.NONE and down.criteria["stage2"] is False


def test_swing_suitability(fx, cfg):
    df = add_indicators(fx("long_vcp_ok"))
    ctx = price_context(df)
    ok, notes = swing_suitability(ctx, Fundamentals(avg_volume=900000), cfg)
    assert ok and notes == ()
    quiet = cfg.model_copy(update={"swing_min_atr_pct": 50.0, "swing_max_atr_pct": 60.0})
    ok2, notes2 = swing_suitability(ctx, Fundamentals(avg_volume=900000), quiet)
    assert not ok2 and any("too low" in n for n in notes2)
