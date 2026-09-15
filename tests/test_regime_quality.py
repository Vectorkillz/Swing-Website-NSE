from datetime import date

import pandas as pd

from engine.quality import check_daily
from engine.regime import classify_regime, regime_effects
from engine.types import Regime
from tests.conftest import SESSION


def test_regimes_from_fixtures(fx, cfg):
    assert classify_regime(fx("index_nifty_bull"), 15.0, fx("index_smallcap"), cfg).regime is Regime.BULL
    assert classify_regime(fx("index_nifty_bull"), 26.0, None, cfg).regime is Regime.BULL_HIGH_VIX
    assert classify_regime(fx("index_nifty_bear"), 15.0, None, cfg).regime is Regime.BEAR
    assert classify_regime(fx("index_nifty_neutral"), 15.0, None, cfg).regime is Regime.NEUTRAL


def test_vix_missing_is_unknown_never_defaulted(fx, cfg):
    r = classify_regime(fx("index_nifty_bull"), None, None, cfg)
    assert r.regime is Regime.UNKNOWN and not r.longs_allowed and not r.shorts_allowed
    assert r.vix is None and "vix_unavailable" in r.reasons
    assert r.nifty_close is not None  # still displayed


def test_nifty_missing_is_unknown(cfg):
    assert classify_regime(None, 15.0, None, cfg).regime is Regime.UNKNOWN


def test_roc_lookback_capped(fx, cfg):
    r = classify_regime(fx("index_nifty_bull").iloc[-100:], 15.0, None, cfg)
    assert r.roc_bars_used == 99


def test_smallcap_confirmation_reported_and_optionally_gating(fx, cfg):
    r = classify_regime(fx("index_nifty_bull"), 15.0, fx("index_nifty_bear").iloc[-60:], cfg)
    assert r.smallcap_confirms is False and r.regime is Regime.BULL  # flag off: displayed only
    strict = cfg.model_copy(update={"require_smallcap_confirmation_for_bull": True})
    r2 = classify_regime(fx("index_nifty_bull"), 15.0, fx("index_nifty_bear").iloc[-60:], strict)
    assert r2.regime is Regime.NEUTRAL and any("smallcap" in x for x in r2.reasons)


def test_regime_table(cfg):
    assert regime_effects(Regime.BULL, cfg) == (True, True)
    assert regime_effects(Regime.BULL_HIGH_VIX, cfg) == (True, False)
    assert regime_effects(Regime.NEUTRAL, cfg) == (True, True)
    assert regime_effects(Regime.BEAR, cfg) == (False, True)
    assert regime_effects(Regime.UNKNOWN, cfg) == (False, False)


def test_quality_gates(fx, cfg):
    assert check_daily(fx("long_vcp_ok"), SESSION, cfg) == []
    assert any(r.startswith("nonpositive_price") for r in check_daily(fx("edge_zero_price"), SESSION, cfg))
    assert any(r.startswith("gap>") for r in check_daily(fx("edge_gap_sessions"), SESSION, cfg))
    assert any(r.startswith("stale_last_bar") for r in check_daily(fx("edge_stale_last_bar"), SESSION, cfg))
    assert any(r.startswith("min_bars") for r in check_daily(fx("edge_too_few_bars"), SESSION, cfg))
    assert check_daily(None, SESSION, cfg) == ["no_data"]
    assert any(r.startswith("future_bar") for r in check_daily(fx("long_vcp_ok"), date(2026, 9, 9), cfg))
