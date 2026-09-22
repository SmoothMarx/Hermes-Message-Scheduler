#!/usr/bin/env python3
"""Drain the message queue — the model-free dispatcher tick.

This is the cadence owner. Nothing else in the plugin runs on a timer: the agent
tools and the dashboard routes send only when a human or the model asks, and this
script is what makes a *scheduled* message actually leave the machine.

It makes no model calls and costs nothing to run, which is why it can tick every
minute from cron instead of being folded into an agent turn.

Usage
-----
    python3 dispatch_due.py                 # send everything due, print a report
    python3 dispatch_due.py --dry-run       # list what is due, send nothing
    python3 dispatch_due.py --sweep-media   # also delete expired attachments
    python3 dispatch_due.py --quiet         # only speak up when something happens

Wire it up (host cron, once a minute):

    * * * * *  <hermes-home>/plugins/message-scheduler/scripts/dispatch_due.py \
               --quiet >> <hermes-home>/logs/message-scheduler.log 2>&1

Exit codes: 0 = ran (individual send failures are recorded in history, not fatal),
2 = the dispatcher itself could not run (DB locked, bad config) — that is the case
cron should shout about.
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

# Run as a script: the plugin dir is the parent of this file's parent, and the
# plugin dir is not importable by name (hyphens) — so bootstrap sys.path.
_PLUGIN_DIR = Path(__file__).resolve().parents[1]
if str(_PLUGIN_DIR) not in sys.path:
    sys.path.insert(0, str(_PLUGIN_DIR))

from msgscheduler import core  # noqa: E402
from msgscheduler.config import load_settings  # noqa: E402


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Send every due scheduled message.")
    parser.add_argument("--dry-run", action="store_true", help="report without sending")
    parser.add_argument("--limit", type=int, default=None, help="max messages this tick")
    parser.add_argument("--sweep-media", action="store_true",
                        help="also delete attachments past their retention window")
    parser.add_argument("--quiet", action="store_true",
                        help="print nothing when there is nothing to report")
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(message)s")
    settings = load_settings()

    try:
        core.init_db(settings)
        report = core.dispatch_due(settings, limit=args.limit, dry_run=args.dry_run)
    except Exception as exc:  # noqa: BLE001 - cron needs a loud, simple failure
        print(f"message-scheduler: dispatcher failed: {exc}", file=sys.stderr)
        return 2

    swept = core.cleanup_old_media(settings) if args.sweep_media else None
    touched = report["scanned"] or swept

    if not args.quiet or touched:
        payload = {
            "dry_run": report["dry_run"],
            "scanned": report["scanned"],
            "sent": [e["id"] for e in report["sent"]],
            "failed": [{"id": e["id"], "error": e["error"]} for e in report["failed"]],
            "missed": [e["id"] for e in report["missed"]],
        }
        if swept is not None:
            payload["media_removed"] = swept
        print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
