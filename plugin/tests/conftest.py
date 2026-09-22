"""Shared fixtures: a temp data dir, a fake bridge, and the plugin package on sys.path."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

PLUGIN_DIR = Path(__file__).resolve().parents[1]
if str(PLUGIN_DIR) not in sys.path:
    sys.path.insert(0, str(PLUGIN_DIR))

from msgscheduler import core  # noqa: E402  (after the sys.path bootstrap above)
from msgscheduler.config import Settings  # noqa: E402


@pytest.fixture
def settings(tmp_path) -> Settings:
    """Explicit settings — no env, no global state, one temp dir per test."""
    data = tmp_path / "data"
    data.mkdir()
    return Settings(
        data_dir=data,
        db_path=data / "scheduler.db",
        media_dir=data / "media",
        bridge_url="http://bridge.invalid:9190",
        grace_seconds=300,
        dispatch_limit=10,
        history_limit=5,
        media_retention_days=30,
    )


class FakeBridge:
    """Records every bridge call and answers a scripted status per method."""

    def __init__(self, responses=None):
        self.calls: list[tuple[str, dict]] = []
        self.responses = responses or {}

    def __call__(self, method: str, payload: dict, settings) -> dict:
        self.calls.append((method, payload))
        return dict(self.responses.get(method, {"status": "sent"}))

    @property
    def methods(self) -> list[str]:
        return [m for m, _ in self.calls]

    def payloads(self, method: str) -> list[dict]:
        return [p for m, p in self.calls if m == method]


@pytest.fixture
def bridge(monkeypatch):
    fake = FakeBridge()
    monkeypatch.setattr(core, "_bridge_transport", fake)
    return fake
