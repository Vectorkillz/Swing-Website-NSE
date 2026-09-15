"""End-to-end engine tests: universe scan, ban list handling, determinism, golden output."""

import json
from pathlib import Path

import pytest

from engine.canonical import dumps, snapshot_hash
from engine.scan import scan_universe
from engine.types import Fundamentals, RankStatus, Regime, ScanInputs, Side, SymbolInput, SymbolOutcome
from tests.conftest import ROOT, SESSION, load_fixture

GOLDEN = ROOT / "tests" / "golden" / "scan_output_v002.json"


def build_inputs(fx, good, *, nifty="index_nifty_bull", vix=15.0, ban=frozenset(), symbols=None):
    weak = Fundamentals(**{**good.__dict__, "roe": 5.0})
    missing = Fundamentals(**{**good.__dict__, "debt_equity": None})
    table = {
        "LONGOK": ("long_vcp_ok", good),
        "COLOUR": ("long_colour_change", good),
        "TINY": ("long_tiny_range_ib", good),
        "MOTHER": ("long_mother_bar", good),
        "STALE": ("long_leg_stale", good),
        "NOPULL": ("long_no_pullback", good),
        "WEAKROE": ("long_vcp_ok", weak),
        "MISSDE": ("long_vcp_ok", missing),
        "SHORTDT": ("short_stage4_downtrend", good),
        "SHORTDB": ("short_double_top", good),
        "ZERO": ("edge_zero_price", good),
        "GAP": ("edge_gap_sessions", good),
        "STALEBAR": ("edge_stale_last_bar", good),
        "FEW": ("edge_too_few_bars", good),
    }
    names = symbols or list(table)
    syms = tuple(SymbolInput(s, fx(table[s][0]), table[s][1], sector=("Pharma" if s.startswith("SHORT") else "Tech")) for s in names)
    return ScanInputs(SESSION, syms, fx(nifty), vix, fx("index_smallcap"), ban, universe_size=len(syms))


def test_universe_scan_bull(fx, good_fundamentals, cfg):
    res = scan_universe(build_inputs(fx, good_fundamentals), cfg)
    assert res.scan_performed and res.regime.regime is Regime.BULL
    st = {s.symbol: s for s in res.symbol_status}
    assert st["LONGOK"].outcome is SymbolOutcome.CANDIDATE
    assert st["WEAKROE"].outcome is SymbolOutcome.REJECTED_GATE
    assert st["MISSDE"].outcome is SymbolOutcome.REJECTED_GATE and "missing:debt_equity" in st["MISSDE"].reasons[0]
    for s in ("ZERO", "GAP", "STALEBAR", "FEW"):
        assert st[s].outcome is SymbolOutcome.DATA_UNAVAILABLE, s
    assert st["NOPULL"].outcome is SymbolOutcome.NO_SETUP
    longs = [c for c in res.candidates if c.side is Side.LONG]
    shorts = [c for c in res.candidates if c.side is Side.SHORT]
    assert {c.symbol for c in longs} >= {"LONGOK", "COLOUR", "TINY", "MOTHER"}
    assert {c.symbol for c in shorts} == {"SHORTDT", "SHORTDB"}
    assert all(c.plan is not None for c in res.candidates)
    tiny = next(c for c in longs if c.symbol == "TINY")
    assert tiny.plan.floor_applied
    assert res.counts["data_unavailable"] == 4
    for c in res.candidates:
        assert c.plan.reward_risk >= cfg.target_min_rr - 1e-9
        assert c.cap_bucket.value == "small"  # good_fundamentals market cap is 12,000 Cr
    rows = {r.symbol: r for r in res.universe}
    assert len(rows) == len(res.symbol_status)
    assert rows["LONGOK"].stage == "stage2" and rows["LONGOK"].setup_side is Side.LONG
    assert rows["ZERO"].close is None and rows["ZERO"].swing_suitable is None


def test_no_scan_when_regime_unknown(fx, good_fundamentals, cfg):
    res = scan_universe(build_inputs(fx, good_fundamentals, vix=None), cfg)
    assert not res.scan_performed and res.candidates == ()
    assert all(s.reasons == ("not_scanned:regime_unknown",) for s in res.symbol_status)


def test_bear_regime_has_no_longs(fx, good_fundamentals, cfg):
    res = scan_universe(build_inputs(fx, good_fundamentals, nifty="index_nifty_bear"), cfg)
    assert res.regime.regime is Regime.BEAR
    assert all(c.side is Side.SHORT for c in res.candidates)
    assert len(res.candidates) == 2


def test_banned_symbol_gets_no_plan(fx, good_fundamentals, cfg):
    res = scan_universe(build_inputs(fx, good_fundamentals, ban=frozenset({"SHORTDT"})), cfg)
    assert "SHORTDT" not in {c.symbol for c in res.candidates}
    st = {s.symbol: s for s in res.symbol_status}
    assert st["SHORTDT"].outcome is SymbolOutcome.BANNED


def test_ban_list_unavailable(fx, good_fundamentals, cfg):
    res = scan_universe(build_inputs(fx, good_fundamentals, ban=None), cfg)
    assert not res.ban_list_available and "ban_list_unavailable" in res.warnings
    assert not any(c.side is Side.SHORT for c in res.candidates)  # require_ban_list = true
    relaxed = cfg.model_copy(update={"require_ban_list": False})
    res2 = scan_universe(build_inputs(fx, good_fundamentals, ban=None), relaxed)
    shorts = [c for c in res2.candidates if c.side is Side.SHORT]
    assert shorts and all(any("ban_list_unavailable" in w for w in c.warnings) for c in shorts)


def test_coverage_degraded_warning(fx, good_fundamentals, cfg):
    res = scan_universe(build_inputs(fx, good_fundamentals, symbols=["LONGOK", "ZERO", "GAP", "FEW"]), cfg)
    assert any(w.startswith("degraded:coverage") for w in res.warnings)


def test_determinism_byte_identical(fx, good_fundamentals, cfg):
    a = dumps(scan_universe(build_inputs(fx, good_fundamentals), cfg))
    b = dumps(scan_universe(build_inputs(fx, good_fundamentals), cfg))
    assert a == b
    h1 = snapshot_hash({"LONGOK": fx("long_vcp_ok")})
    h2 = snapshot_hash({"LONGOK": load_fixture("long_vcp_ok")})
    assert h1 == h2


def test_golden_output(fx, good_fundamentals, cfg, request):
    """Reviewed golden file. Regenerate deliberately with: pytest --update-golden."""
    out = json.loads(dumps(scan_universe(build_inputs(fx, good_fundamentals), cfg)))
    if request.config.getoption("--update-golden"):
        GOLDEN.parent.mkdir(exist_ok=True)
        GOLDEN.write_text(json.dumps(out, indent=2, sort_keys=True) + "\n", encoding="utf-8", newline="\n")
        pytest.skip("golden updated")
    assert GOLDEN.exists(), "golden file missing; run pytest --update-golden and review the diff"
    assert out == json.loads(GOLDEN.read_text(encoding="utf-8"))


def test_no_advice_wording_in_engine_or_web():
    import re

    pattern = re.compile(r"recommend|probabilit|buy signal", re.I)
    offenders = []
    for folder in ("engine", "pipeline", "web/src"):
        for p in (ROOT / folder).rglob("*"):
            if p.suffix in (".py", ".ts", ".tsx") and pattern.search(p.read_text(encoding="utf-8", errors="ignore")):
                offenders.append(str(p.relative_to(ROOT)))
    assert offenders == [], offenders
