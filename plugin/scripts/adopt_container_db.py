#!/usr/bin/env python3
"""Adopt the standalone container's data into the plugin (contacts, queue, history).

The plugin re-roots its SQLite file under the plugin data dir. The old container
keeps its database in a docker volume, so moving to the plugin means copying that
one file — nothing else in the container is state (media lives in
``/tmp/hermes_scheduler_media`` inside the container and in ``uploads/`` on the
host).

What it does, in order:
  1. locate the source DB (a docker volume, or a path),
  2. copy it to a staging file inside the plugin data dir,
  3. verify it opens and has the expected tables and row counts,
  4. back up any existing plugin DB to ``<db>.bak-<timestamp>``,
  5. move the staged copy into place.

It never touches the container, never deletes the source, and refuses to run if a
live copy already has rows unless ``--force`` is passed.

    python3 adopt_container_db.py                      # from the container volume
    python3 adopt_container_db.py --source /path/db    # from a file
    python3 adopt_container_db.py --dry-run            # report only
"""

from __future__ import annotations

import argparse
import json
import shutil
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

_PLUGIN_DIR = Path(__file__).resolve().parents[1]
if str(_PLUGIN_DIR) not in sys.path:
    sys.path.insert(0, str(_PLUGIN_DIR))

from msgscheduler.config import load_settings  # noqa: E402

DEFAULT_VOLUME = "message-scheduler_scheduler_data"
CONTAINER_DB_NAME = "scheduler.db"
EXPECTED_TABLES = {"contacts", "history", "messages", "server_settings", "templates"}


def from_volume(volume: str, dest: Path) -> None:
    """Copy the DB out of a docker volume without starting the app."""
    cmd = [
        "docker", "run", "--rm",
        "-v", f"{volume}:/d:ro",
        "-v", f"{dest.parent}:/out",
        "alpine", "cp", f"/d/{CONTAINER_DB_NAME}", f"/out/{dest.name}",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(
            f"docker copy failed ({result.returncode}): {result.stderr.strip() or 'no output'}"
        )


def inspect(path: Path) -> dict:
    con = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        tables = {r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        counts = {}
        for table in sorted(tables & EXPECTED_TABLES):
            counts[table] = con.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    finally:
        con.close()
    return {"tables": sorted(tables), "counts": counts,
            "missing_expected": sorted(EXPECTED_TABLES - tables)}


def main(argv: list[str] | None = None) -> int:
    settings = load_settings()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", help="DB file path (default: the docker volume)")
    parser.add_argument("--volume", default=DEFAULT_VOLUME, help=f"docker volume (default {DEFAULT_VOLUME})")
    parser.add_argument("--db", default=str(settings.db_path), help="target plugin DB path")
    parser.add_argument("--force", action="store_true", help="overwrite a target that already has rows")
    parser.add_argument("--dry-run", action="store_true", help="report what would happen")
    args = parser.parse_args(argv)

    target = Path(args.db).expanduser()
    target.parent.mkdir(parents=True, exist_ok=True)
    staged = target.parent / f".adopt-{int(time.time())}.db"

    if target.exists():
        state = inspect(target)
        rows = sum(state["counts"].values())
        if rows and not args.force:
            print(json.dumps({
                "status": "refused",
                "reason": "target already has rows — pass --force to replace it",
                "target": str(target),
                "counts": state["counts"],
            }, indent=2))
            return 1

    try:
        if args.source:
            shutil.copy2(Path(args.source).expanduser(), staged)
            origin = str(Path(args.source).expanduser())
        else:
            from_volume(args.volume, staged)
            origin = f"docker volume {args.volume}"
    except Exception as exc:  # noqa: BLE001 - one clear message beats a traceback
        print(json.dumps({"status": "error", "reason": str(exc)}, indent=2))
        return 2

    state = inspect(staged)
    if state["missing_expected"]:
        staged.unlink(missing_ok=True)
        print(json.dumps({
            "status": "error",
            "reason": f"staged DB is missing expected tables: {state['missing_expected']}",
            "found": state["tables"],
        }, indent=2))
        return 2

    report = {
        "status": "dry-run" if args.dry_run else "adopted",
        "origin": origin,
        "target": str(target),
        "counts": state["counts"],
    }

    if args.dry_run:
        staged.unlink(missing_ok=True)
        print(json.dumps(report, indent=2))
        return 0

    if target.exists():
        backup = target.with_suffix(target.suffix + f".bak-{time.strftime('%Y%m%d-%H%M%S')}")
        shutil.copy2(target, backup)
        report["backup"] = str(backup)

    shutil.move(str(staged), str(target))
    report["final"] = inspect(target)["counts"]
    print(json.dumps(report, indent=2))
    print(f"\nAdopted. The plugin now reads {target} — the container copy is untouched.",
          file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
