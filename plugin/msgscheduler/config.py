"""Settings resolution for the message-scheduler plugin.

One source of truth for all three surfaces (agent tools, dashboard REST half,
cron dispatcher). Per-key resolution order:

    env override  ->  <data_dir>/settings.json  ->  built-in default

When running inside the agent process, :func:`load_settings` also overlays the
plugin's own config namespace (``plugins.entries.message-scheduler.settings``,
reached through ``ctx.get_config``) so users can set behaviour in config.yaml
without touching a JSON file. The cron dispatcher has no ctx and simply skips
that layer.

The plugin dir name contains a hyphen and is therefore not importable as a
Python package by name: everything here is relative-import safe and works
whether the loader imported us as ``<plugin-id>`` or a bootstrap imported us as
a synthetic package (see ``scripts/_bootstrap.py``).
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path

# Plugin root = the directory Hermes installs (holds __init__.py, dashboard/, desktop/).
# This file sits one level down in the msgscheduler package, so go up one.
PKG_DIR = Path(__file__).resolve().parent
PLUGIN_DIR = PKG_DIR.parent

DEFAULTS = {
    # Behaviour
    "bridge_url": "http://127.0.0.1:9190",
    "bridge_timeout": 15,
    "grace_seconds": 300,  # missed vs send-late boundary
    "dispatch_limit": 10,  # messages claimed per dispatcher run
    "history_limit": 200,  # history rows kept
    "media_retention_days": 30,
    "timezone": "UTC",  # interpretation of naive timestamps
    # Paths (None = derive from the plugin data dir)
    "data_dir": None,
    "db_path": None,
    "media_dir": None,
}

ENV_OVERRIDES = {
    "db_path": "MESSAGE_SCHEDULER_DB",
    "media_dir": "MESSAGE_SCHEDULER_MEDIA",
    "data_dir": "MESSAGE_SCHEDULER_DATA_DIR",
    "bridge_url": "HERMES_BRIDGE_URL",
    "bridge_timeout": "HERMES_BRIDGE_TIMEOUT",
}

# Keys a user may set from config.yaml (never secrets — those live in .env).
CTX_KEYS = (
    "bridge_url",
    "bridge_timeout",
    "grace_seconds",
    "dispatch_limit",
    "history_limit",
    "media_retention_days",
    "timezone",
)


def hermes_home() -> Path:
    """Resolve the active Hermes home without importing the agent package."""
    env = os.environ.get("HERMES_HOME")
    if env:
        return Path(env).expanduser()
    return Path.home() / ".hermes"


def default_data_dir() -> Path:
    """Where the DB, media and settings.json live by default.

    Deliberately OUTSIDE the plugin directory: reinstalling or updating the plugin
    replaces that directory wholesale, and the queue/contacts/history must survive
    that. Override with MESSAGE_SCHEDULER_DATA_DIR (or a data_dir in settings.json).
    """
    return hermes_home() / "plugin-data" / "message-scheduler"


def _coerce(raw: str, current):
    """Coerce an env string to the type of the current value."""
    if isinstance(current, bool):
        return raw.strip().lower() in ("1", "true", "yes", "on")
    if isinstance(current, int) and not isinstance(current, bool):
        try:
            return int(raw)
        except ValueError:
            return current
    if isinstance(current, float):
        try:
            return float(raw)
        except ValueError:
            return current
    return raw


@dataclass
class Settings:
    """Resolved plugin settings. Values are plain data — no lazy lookups."""

    bridge_url: str = DEFAULTS["bridge_url"]
    bridge_timeout: int = DEFAULTS["bridge_timeout"]
    grace_seconds: int = DEFAULTS["grace_seconds"]
    dispatch_limit: int = DEFAULTS["dispatch_limit"]
    history_limit: int = DEFAULTS["history_limit"]
    media_retention_days: int = DEFAULTS["media_retention_days"]
    timezone: str = DEFAULTS["timezone"]
    data_dir: Path = field(default_factory=default_data_dir)
    # None = derive from data_dir. Keeping these empty lets a data_dir override
    # (env or settings.json) actually relocate the DB and media, instead of
    # silently writing into the plugin install directory.
    db_path: Path | None = None
    media_dir: Path | None = None
    sources: dict = field(default_factory=dict)  # key -> which layer won (diagnostics)

    def as_dict(self, redact_paths: bool = False) -> dict:
        out = {
            k: (str(v) if isinstance(v, Path) else v)
            for k, v in vars(self).items()
            if k != "sources"
        }
        return out


def settings_file(data_dir: Path) -> Path:
    return Path(data_dir) / "settings.json"


def load_settings(ctx=None) -> Settings:
    """Resolve settings from env, settings.json and (when available) ctx config."""
    s = Settings()
    seen: dict[str, str] = {}

    # Layer 0: a non-default data dir may itself come from the env.
    env_data = os.environ.get("MESSAGE_SCHEDULER_DATA_DIR")
    if env_data:
        s.data_dir = Path(env_data).expanduser()
        seen["data_dir"] = "env"

    # Layer 1: settings.json inside the data dir (written by install/UI).
    try:
        raw = json.loads(settings_file(s.data_dir).read_text())
    except (OSError, ValueError):
        raw = {}
    if isinstance(raw, dict):
        for key, value in raw.items():
            if key in DEFAULTS and value is not None:
                setattr(s, key, value)
                seen[key] = "settings.json"

    # Layer 2: the plugin's config.yaml namespace.
    if ctx is not None and hasattr(ctx, "get_config"):
        for key in CTX_KEYS:
            try:
                value = ctx.get_config(key, default=None)
            except Exception:  # a bad ctx must never break a tool call
                value = None
            if value is not None and value != "":
                setattr(s, key, value)
                seen[key] = "config.yaml"

    # Layer 3: process env wins (containers, cron, tests).
    for key, env_name in ENV_OVERRIDES.items():
        if env_name in os.environ and os.environ[env_name] != "":
            setattr(s, key, _coerce(os.environ[env_name], getattr(s, key)))
            seen[key] = f"env:{env_name}"

    # Derive paths: explicit wins, otherwise hang everything off the data dir.
    resolve_paths(s)
    s.sources = seen
    return s


def resolve_paths(s: Settings) -> Settings:
    """Fill in the paths derived from data_dir. Idempotent — call it anywhere."""
    s.data_dir = Path(s.data_dir).expanduser()
    s.db_path = Path(s.db_path).expanduser() if s.db_path else s.data_dir / "scheduler.db"
    s.media_dir = Path(s.media_dir).expanduser() if s.media_dir else s.data_dir / "media"
    return s


def ensure_dirs(s: Settings) -> None:
    s = resolve_paths(s)
    s.data_dir.mkdir(parents=True, exist_ok=True)
    assert s.media_dir is not None  # guaranteed by resolve_paths
    s.media_dir.mkdir(parents=True, exist_ok=True)
