"""Single source of truth for repository data paths."""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CONFIG_DIR = ROOT / "config"
PROFILES_DIR = CONFIG_DIR / "profiles"
ACTIVE_FILE = CONFIG_DIR / "active.json"
DATA = ROOT / "data"
OHLCV_DAILY = DATA / "ohlcv" / "daily"
OHLCV_INDEX = DATA / "ohlcv" / "index"
FUNDAMENTALS = DATA / "fundamentals"
UNIVERSE = DATA / "universe"
BAN_LIST = DATA / "ban_list"
CALENDAR = DATA / "calendar"
RUNS = DATA / "runs"
CHARTS = DATA / "charts"
JOBS = DATA / "jobs"
CONFIG_OUT = DATA / "config"
TEST_VECTORS = DATA / "test_vectors"
BACKTESTS = DATA / "backtests"
