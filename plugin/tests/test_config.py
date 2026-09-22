"""Settings resolution — the paths a user can move must actually move."""

from __future__ import annotations

import json
import sys
from pathlib import Path

PLUGIN_DIR = Path(__file__).resolve().parents[1]
if str(PLUGIN_DIR) not in sys.path:
    sys.path.insert(0, str(PLUGIN_DIR))

from msgscheduler.config import hermes_home, load_settings  # noqa: E402


def test_defaults_avoid_the_plugin_directory_so_reinstalls_cannot_wipe_data():
    settings = load_settings()
    assert settings.data_dir == hermes_home() / "plugin-data" / "message-scheduler"
    assert settings.db_path == settings.data_dir / "scheduler.db"
    assert settings.media_dir == settings.data_dir / "media"
    # The plugin dir is replaced wholesale on install: nothing durable may live in it.
    assert PLUGIN_DIR not in settings.data_dir.parents
    assert settings.data_dir != PLUGIN_DIR / "data"


def test_hermes_home_env_relocates_the_default_data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / ".hermes"))

    settings = load_settings()

    assert settings.data_dir == tmp_path / ".hermes" / "plugin-data" / "message-scheduler"


def test_data_dir_env_moves_the_db_and_media_with_it(tmp_path, monkeypatch):
    monkeypatch.setenv("MESSAGE_SCHEDULER_DATA_DIR", str(tmp_path / "elsewhere"))

    settings = load_settings()

    assert settings.db_path == tmp_path / "elsewhere" / "scheduler.db"
    assert settings.media_dir == tmp_path / "elsewhere" / "media"


def test_explicit_db_env_wins_over_the_data_dir(tmp_path, monkeypatch):
    monkeypatch.setenv("MESSAGE_SCHEDULER_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("MESSAGE_SCHEDULER_DB", str(tmp_path / "custom.sqlite"))

    settings = load_settings()

    assert settings.db_path == tmp_path / "custom.sqlite"
    assert settings.media_dir == tmp_path / "data" / "media"


def test_settings_json_is_read_from_the_data_dir_and_env_still_wins(tmp_path, monkeypatch):
    data = tmp_path / "data"
    data.mkdir()
    (data / "settings.json").write_text(json.dumps({"history_limit": 7, "grace_seconds": 60}))
    monkeypatch.setenv("MESSAGE_SCHEDULER_DATA_DIR", str(data))
    monkeypatch.setenv("HERMES_BRIDGE_URL", "http://127.0.0.1:9999")

    settings = load_settings()

    assert settings.history_limit == 7
    assert settings.grace_seconds == 60
    assert settings.bridge_url == "http://127.0.0.1:9999"
    assert settings.sources["history_limit"] == "settings.json"
    assert settings.sources["bridge_url"] == "env:HERMES_BRIDGE_URL"


def test_ctx_config_layer_is_overlaid_but_never_breaks_a_call():
    class FakeCtx:
        def get_config(self, key, default=None):
            return {"history_limit": 11, "grace_seconds": ""}[key] if key in (
                "history_limit", "grace_seconds") else default

    class ExplodingCtx:
        def get_config(self, key, default=None):
            raise RuntimeError("ctx went away")

    assert load_settings(FakeCtx()).history_limit == 11
    # an empty string means "not set", so the default stands
    assert load_settings(FakeCtx()).grace_seconds == 300
    assert load_settings(ExplodingCtx()).history_limit == 200


def test_int_env_values_are_coerced_not_strings(tmp_path, monkeypatch):
    monkeypatch.setenv("MESSAGE_SCHEDULER_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("HERMES_BRIDGE_TIMEOUT", "42")

    assert load_settings().bridge_timeout == 42
