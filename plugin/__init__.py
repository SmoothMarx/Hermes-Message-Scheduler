"""Message Scheduler — Hermes plugin (agent half).

Three surfaces, one core:

* ``core.py``                  — schema, queue, dispatch, bridge client (shared)
* ``tools.py`` / ``schemas.py`` — the agent tools registered here
* ``dashboard/plugin_api.py``   — REST half for the dashboard and desktop app
* ``desktop/plugin.js``         — the desktop app page
* ``scripts/dispatch_due.py``   — model-free cron tick that drains the queue

``register(ctx)`` is the only entry point Hermes calls. It is deliberately
side-effect free apart from registration: a plugin that writes during startup is
a plugin that can break a session before the first prompt.
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

# The plugin directory is NOT importable by name (hyphens), and Hermes' loader may
# import this file either as a package or as a standalone module. Put the plugin dir
# on sys.path and import the uniquely-named library package, so every entry point
# (agent loader, dashboard loader, cron script) resolves the same modules.
_PLUGIN_DIR = Path(__file__).resolve().parent
if str(_PLUGIN_DIR) not in sys.path:
    sys.path.insert(0, str(_PLUGIN_DIR))

from msgscheduler import core, schemas, tools  # noqa: E402

__all__ = ["register"]

log = logging.getLogger("message-scheduler")

SKILL_DIR = _PLUGIN_DIR / "skills" / "message-scheduler"


def register(ctx) -> None:
    """Wire schemas to handlers and make plugin config visible to the tools."""
    tools.configure(ctx)

    for name, schema in schemas.ALL_SCHEMAS.items():
        ctx.register_tool(
            name=name,
            toolset="message-scheduler",
            schema=schema,
            handler=getattr(tools, name),
        )

    _register_skill(ctx)

    # The schema is created lazily on first use, but the agent should never be the
    # thing that discovers a missing table mid-tool-call: prepare it at register
    # time (cheap, idempotent, no network).
    try:
        core.init_db()
    except Exception as exc:  # a bad path must not disable the whole plugin
        log.warning("db init skipped: %s", exc)


def _register_skill(ctx) -> None:
    """Expose the bundled usage skill, when this Hermes build supports it.

    ``ctx.register_skill(name, path)`` takes the PATH (it reads and validates the
    file itself — passing the markdown text raises inside the host and the skill
    silently fails to register). The skills/ folder also ships on disk, so on
    older builds the failure mode is "documented but not auto-loaded" rather than
    an error at startup.
    """
    skill_md = SKILL_DIR / "SKILL.md"
    if not skill_md.is_file() or not hasattr(ctx, "register_skill"):
        return
    try:
        ctx.register_skill(
            "message-scheduler",
            skill_md,
            description="Schedule, cancel or review messages the scheduler sends later.",
        )
    except Exception as exc:
        log.warning("skill not registered: %s", exc)
