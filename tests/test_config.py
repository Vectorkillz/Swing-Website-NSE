import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from engine.config import ScanConfig, config_hash, diff_profiles, export_json_schema, load_profile

ROOT = Path(__file__).resolve().parents[1]


def test_all_profiles_validate():
    profiles = sorted((ROOT / "config" / "profiles").glob("*.json"))
    assert profiles
    for p in profiles:
        version, cfg = load_profile(p)
        assert version == p.stem
        assert cfg.capital > 0


def test_active_points_at_existing_profile():
    active = json.loads((ROOT / "config" / "active.json").read_text())["active"]
    assert (ROOT / "config" / "profiles" / f"{active}.json").exists()


def test_profile_is_explicit_about_every_field():
    """The committed profile must spell out every field so a default change in code never
    silently changes a versioned profile."""
    raw = json.loads((ROOT / "config" / "profiles" / "v001.json").read_text())
    assert set(raw) == set(ScanConfig.model_fields)


def test_schema_has_units_everywhere():
    schema = export_json_schema()
    for name, prop in schema["properties"].items():
        assert "x-unit" in prop, name
        assert "x-group" in prop, name
        assert prop.get("description"), name


def test_extra_fields_rejected_and_ranges_checked():
    with pytest.raises(ValidationError):
        ScanConfig(unknown_field=1)  # type: ignore[call-arg]
    with pytest.raises(ValidationError):
        ScanConfig(vcp_depth_min=30, vcp_depth_max=25)
    with pytest.raises(ValidationError):
        ScanConfig(capital=0)


def test_hash_and_diff():
    a = ScanConfig()
    b = ScanConfig(capital=600000)
    assert config_hash(a) != config_hash(b)
    assert config_hash(a) == config_hash(ScanConfig())
    d = diff_profiles(a, b)
    assert d == [{"field": "capital", "from": 500000.0, "to": 600000.0}]
