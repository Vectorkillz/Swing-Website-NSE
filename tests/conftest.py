from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import pandas as pd
import pytest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from engine.config import ScanConfig, load_profile  # noqa: E402
from engine.types import Fundamentals, Regime, RegimeResult  # noqa: E402

FIXTURES = ROOT / "tests" / "fixtures"
SESSION = date(2026, 9, 10)


def pytest_addoption(parser):
    parser.addoption("--update-golden", action="store_true", default=False, help="rewrite tests/golden files")


@pytest.fixture(scope="session")
def cfg() -> ScanConfig:
    return load_profile(ROOT / "config" / "profiles" / "v002.json")[1]


def load_fixture(name: str) -> pd.DataFrame:
    return pd.read_csv(FIXTURES / f"{name}.csv", index_col="date", parse_dates=True)


@pytest.fixture
def fx():
    return load_fixture


@pytest.fixture
def good_fundamentals() -> Fundamentals:
    return Fundamentals(
        market_cap_cr=12000, avg_volume=900000, debt_equity=0.4, roe=18.0, revenue_growth=22.0,
        eps_growth=30.0, fcf_positive=True, sector="Technology", industry="Software", name="Test Co",
        fetched_at="2026-09-10T10:00:00", source="fixture",
    )


def make_regime(regime: Regime, cfg: ScanConfig) -> RegimeResult:
    from engine.regime import regime_effects

    longs, shorts = regime_effects(regime, cfg)
    return RegimeResult(regime=regime, longs_allowed=longs, shorts_allowed=shorts, vix=15.0)
