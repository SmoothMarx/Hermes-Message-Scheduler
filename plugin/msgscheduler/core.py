"""Message Scheduler core — schema, queue, contacts, dispatch, bridge client.

Ported from the standalone ``api.py`` at repo HEAD ``a8b1e8f`` so that the exact
same scheduling logic serves every surface:

* agent tools        (``tools.py``)
* dashboard REST half (``dashboard/plugin_api.py``)
* cron dispatcher    (``scripts/dispatch_due.py``)

Deliberate differences from ``api.py`` (all documented, none silent):

* no uvicorn, no background threads, no CORS — the host owns the process and the
  cadence; :func:`dispatch_due` is a pure call
* paths are re-rooted under the plugin data dir instead of ``/tmp`` and ``data/``
* ``messages.dispatched_at`` is finally written (the column existed but no code
  path ever set it)
* every bridge call goes through one function so a fake bridge can be injected
  in tests
"""

from __future__ import annotations

import json
import re
import sqlite3
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Iterable
from zoneinfo import ZoneInfo

from .config import Settings, ensure_dirs, load_settings

SCHEMA = """
CREATE TABLE IF NOT EXISTS templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    person TEXT NOT NULL DEFAULT '',
    network TEXT NOT NULL DEFAULT '',
    text TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person TEXT NOT NULL,
    network TEXT NOT NULL,
    text TEXT NOT NULL,
    scheduled_at TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    error TEXT,
    attachments TEXT DEFAULT '[]',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    dispatched_at TEXT
);

CREATE TABLE IF NOT EXISTS history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    person TEXT NOT NULL,
    network TEXT NOT NULL,
    text TEXT NOT NULL,
    status TEXT NOT NULL,
    time TEXT,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    network TEXT NOT NULL,
    identifier TEXT DEFAULT '',
    source TEXT DEFAULT 'manual',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS server_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_status ON messages(status);
CREATE INDEX IF NOT EXISTS idx_messages_scheduled ON messages(scheduled_at);
CREATE INDEX IF NOT EXISTS idx_contacts_name ON contacts(name);
CREATE INDEX IF NOT EXISTS idx_contacts_network ON contacts(network);
"""

# Message lifecycle. `dispatching` is the claim state used by the cron mode.
QUEUE_STATES = ("pending", "dispatched", "dispatching", "cancelled")
LIVE_STATES = ("pending", "dispatched")
TERMINAL_HISTORY_STATES = ("sent", "failed", "missed")

# Beeper-bridged platforms need a chat created on demand: raw platform id -> Beeper account.
BEEPER_PLATFORMS = {
    "facebook/messenger": "facebookgo",
    "facebook": "facebookgo",
    "instagram": "instagramgo",
    "linkedin": "linkedin",
}

_NOTIFY_KEY = "notify_channel"
_NOTIFY_ID_KEY = "notify_identifier"
_NOTIFY_USER_KEY = "notify_user_name"

# Test seam: replaced wholesale in tests with a fake.
_bridge_transport = None  # type: ignore[var-annotated]

# DB paths whose schema has been created in this process (see connect()).
_SCHEMA_READY: set[str] = set()


# --- Time ------------------------------------------------------------------


def normalize_time(iso_str: str, settings: Settings | None = None) -> str:
    """ISO 8601 -> SQLite 'YYYY-MM-DD HH:MM:SS' (what ``datetime('now')`` compares against).

    An offset-bearing input is converted; a naive input is interpreted in the
    configured timezone (default UTC, matching the original single-container
    behaviour where every writer sent ``Z`` timestamps).
    """
    settings = settings or load_settings()
    text = (iso_str or "").strip()
    if not text:
        raise ValueError("empty timestamp")
    try:
        dt = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError:
        # Already SQLite-shaped, or an epoch number.
        try:
            dt = datetime.fromtimestamp(float(text), tz=timezone.utc)
        except (ValueError, OSError) as exc:
            raise ValueError(f"unparsable timestamp: {iso_str!r}") from exc
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=ZoneInfo(settings.timezone or "UTC"))
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def utcnow_sql() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")


def _sql_to_iso(value: str | None) -> str | None:
    """SQLite timestamp -> ISO 8601 with a trailing Z, for JS consumers."""
    if not value:
        return value
    try:
        return datetime.fromisoformat(value).isoformat() + "Z"
    except ValueError:
        return value


# --- Database --------------------------------------------------------------


def connect(settings: Settings | None = None) -> sqlite3.Connection:
    """Open the DB, creating the schema on first use in this process.

    Every public function goes through here, so a caller that never ran
    ``init_db`` (a tool call, a cron tick, a test) cannot hit "no such table" —
    the schema is created lazily but exactly once per DB path per process.
    """
    settings = settings or load_settings()
    ensure_dirs(settings)
    conn = sqlite3.connect(str(settings.db_path), timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=30000")
    key = str(settings.db_path)
    if key not in _SCHEMA_READY:
        _apply_schema(conn)
        _SCHEMA_READY.add(key)
    return conn


def _apply_schema(conn: sqlite3.Connection) -> None:
    """Create tables/indexes and add columns that older DBs lack."""
    conn.executescript(SCHEMA)
    for table, column, ddl in (
        ("messages", "attachments", "TEXT DEFAULT '[]'"),
        ("messages", "dispatched_at", "TEXT"),
        ("messages", "error", "TEXT"),
    ):
        cols = {row["name"] for row in conn.execute(f"PRAGMA table_info({table})")}
        if column not in cols:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}")
    conn.commit()


def init_db(settings: Settings | None = None) -> Path:
    """Create/migrate the schema explicitly. Idempotent, and safe to call on every startup."""
    settings = settings or load_settings()
    conn = connect(settings)
    try:
        _apply_schema(conn)  # force, so a DB file that was replaced is rebuilt
        _SCHEMA_READY.add(str(settings.db_path))
    finally:
        conn.close()
    return settings.db_path


# --- Bridge ----------------------------------------------------------------


def call_bridge(method: str, payload: dict, settings: Settings | None = None) -> dict:
    """POST to the host bridge (``HERMES_BRIDGE_URL``/<method>).

    Returns ``{"status": "bridge_error", "error": ...}`` instead of raising, so a
    dead bridge becomes a failed message with a reason — never a lost one.
    """
    settings = settings or load_settings()
    if _bridge_transport is not None:
        return _bridge_transport(method, payload, settings)

    url = f"{settings.bridge_url.rstrip('/')}/{method}"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url, data=data, headers={"Content-Type": "application/json"}, method="POST"
    )
    try:
        with urllib.request.urlopen(req, timeout=settings.bridge_timeout) as resp:
            return json.loads(resp.read().decode() or "{}")
    except urllib.error.HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode()[:300]
        except Exception:
            pass
        return {"status": "bridge_error", "error": f"HTTP {exc.code} {detail}".strip()}
    except Exception as exc:  # connection refused, timeout, bad json
        return {"status": "bridge_error", "error": str(exc)}


def bridge_status(settings: Settings | None = None) -> dict:
    result = call_bridge("status", {}, settings)
    result.setdefault("bridge_url", (settings or load_settings()).bridge_url)
    return result


# --- Media -----------------------------------------------------------------


_ATTACHMENT_RE = re.compile(r"\[Attachment:\s*(.+?)\]")


def media_path(filename: str, settings: Settings | None = None) -> Path | None:
    """Resolve an uploaded media filename, refusing traversal. None if unsafe/missing."""
    settings = settings or load_settings()
    if not filename or ".." in filename or "/" in filename or "\\" in filename:
        return None
    path = Path(settings.media_dir) / filename
    return path if path.is_file() else None


def save_media(data: bytes, filename: str, settings: Settings | None = None) -> dict:
    """Store an upload; returns the same shape the old container API returned."""
    settings = settings or load_settings()
    ensure_dirs(settings)
    safe_name = f"{int(time.time())}_{Path(filename or 'file').name}"
    path = Path(settings.media_dir) / safe_name
    path.write_bytes(data)
    return {"path": str(path), "url": f"/media/{safe_name}", "name": filename, "filename": safe_name}


def cleanup_message_media(text: str, settings: Settings | None = None) -> list[str]:
    """Delete files referenced by ``[Attachment: <path>]`` markers inside the media dir.

    The original deleted any absolute path it could parse — that is an arbitrary
    file-delete primitive, so the plugin only touches its own media dir.
    """
    settings = settings or load_settings()
    removed: list[str] = []
    for match in _ATTACHMENT_RE.finditer(text or ""):
        raw = match.group(1).strip()
        candidate = Path(raw)
        if not candidate.is_absolute() or candidate.parent != Path(settings.media_dir):
            candidate = Path(settings.media_dir) / candidate.name
        try:
            if candidate.is_file() and candidate.parent == Path(settings.media_dir):
                candidate.unlink()
                removed.append(str(candidate))
        except OSError:
            pass
    return removed


def cleanup_old_media(settings: Settings | None = None, days: int | None = None) -> int:
    """Drop media older than the retention window. Returns how many files went."""
    settings = settings or load_settings()
    days = days if days is not None else settings.media_retention_days
    cutoff = time.time() - (days * 86400)
    removed = 0
    try:
        for entry in Path(settings.media_dir).iterdir():
            try:
                if entry.is_file() and entry.stat().st_mtime < cutoff:
                    entry.unlink()
                    removed += 1
            except OSError:
                pass
    except (OSError, FileNotFoundError):
        pass
    return removed


# --- Server settings -------------------------------------------------------


def get_setting(key: str, default: str = "", settings: Settings | None = None) -> str:
    conn = connect(settings)
    try:
        row = conn.execute("SELECT value FROM server_settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default
    finally:
        conn.close()


def set_setting(key: str, value: str, settings: Settings | None = None) -> None:
    conn = connect(settings)
    try:
        conn.execute(
            "INSERT OR REPLACE INTO server_settings (key, value) VALUES (?, ?)", (key, value)
        )
        conn.commit()
    finally:
        conn.close()


def get_notify_settings(settings: Settings | None = None) -> dict:
    return {
        "channel": get_setting(_NOTIFY_KEY, "", settings),
        "identifier": get_setting(_NOTIFY_ID_KEY, "", settings),
        "user_name": get_setting(_NOTIFY_USER_KEY, "there", settings),
    }


def set_notify_settings(channel: str, identifier: str, user_name: str = "there",
                        settings: Settings | None = None) -> dict:
    set_setting(_NOTIFY_KEY, channel, settings)
    set_setting(_NOTIFY_ID_KEY, identifier, settings)
    set_setting(_NOTIFY_USER_KEY, user_name, settings)
    return {"status": "saved"}


def send_notification(status: str, person: str, network: str, text: str,
                      scheduled_at: str, settings: Settings | None = None) -> dict | None:
    """Tell the configured channel that a message was sent (or failed)."""
    settings = settings or load_settings()
    notify = get_notify_settings(settings)
    if not notify["channel"] or not notify["identifier"]:
        return None

    short = (text[:80] + "...") if len(text) > 80 else text
    when = scheduled_at.replace("T", " ").split(".")[0] if "T" in scheduled_at else scheduled_at
    if status == "sent":
        body = (f"Hey {notify['user_name']}, your message to {person} via {network} "
                f"has been sent successfully at {when}")
    else:
        body = (f"Hey {notify['user_name']}, your message to {person} \"{short}\" "
                f"has failed at {when}")
    return call_bridge("send", {"network": notify["channel"],
                                "person": notify["identifier"], "text": body}, settings)


# --- Queue -----------------------------------------------------------------


def schedule(person: str, network: str, when: str, text: str,
             attachments: Iterable[str] | None = None, replace_id: int | None = None,
             settings: Settings | None = None) -> dict:
    """Queue a message for ``when``. Dedups an identical pending row; may replace one."""
    settings = settings or load_settings()
    conn = connect(settings)
    replaced_text = ""
    try:
        if replace_id is not None:
            row = conn.execute(
                "SELECT text FROM messages WHERE id = ? AND status IN ('pending', 'dispatched')",
                (replace_id,),
            ).fetchone()
            if row:
                replaced_text = row["text"]
                conn.execute("UPDATE messages SET status = 'cancelled' WHERE id = ?", (replace_id,))

        scheduled_at = normalize_time(when, settings)
        # Dedup: an identical pending schedule is a double-submit, not a new intent.
        existing = conn.execute(
            """SELECT id FROM messages
               WHERE person = ? AND network = ? AND text = ? AND scheduled_at = ?
                 AND status = 'pending'""",
            (person, network, text, scheduled_at),
        ).fetchone()
        if existing:
            conn.commit()
            return {"status": "ignored_dedup", "id": existing["id"]}

        cursor = conn.execute(
            """INSERT INTO messages (person, network, text, scheduled_at, status, attachments)
               VALUES (?, ?, ?, ?, 'pending', ?)""",
            (person, network, text, scheduled_at, json.dumps(list(attachments or []))),
        )
        conn.commit()
        new_id = cursor.lastrowid
    finally:
        conn.close()

    # The replaced message is cancelled and committed — only now is its media orphaned.
    if replaced_text:
        cleanup_message_media(replaced_text, settings)
    return {"status": "scheduled", "id": new_id, "scheduled_at": scheduled_at}


def send_now(person: str, network: str, text: str,
             attachments: Iterable[str] | None = None,
             settings: Settings | None = None) -> dict:
    """Queue for immediate dispatch (status ``dispatched`` = due now)."""
    settings = settings or load_settings()
    conn = connect(settings)
    try:
        cursor = conn.execute(
            """INSERT INTO messages (person, network, text, scheduled_at, status, attachments)
               VALUES (?, ?, ?, ?, 'dispatched', ?)""",
            (person, network, text, utcnow_sql(), json.dumps(list(attachments or []))),
        )
        conn.commit()
        return {"status": "queued_for_immediate", "id": cursor.lastrowid}
    finally:
        conn.close()


def cancel(job_id: int, settings: Settings | None = None) -> dict:
    settings = settings or load_settings()
    conn = connect(settings)
    try:
        row = conn.execute(
            "SELECT text FROM messages WHERE id = ? AND status IN ('pending', 'dispatched')",
            (job_id,),
        ).fetchone()
        if not row:
            return {"status": "not_found", "id": job_id}
        conn.execute("UPDATE messages SET status = 'cancelled' WHERE id = ?", (job_id,))
        conn.commit()
        text = row["text"]
    finally:
        conn.close()
    cleanup_message_media(text, settings)
    return {"status": "cancelled", "id": job_id}


def list_jobs(settings: Settings | None = None, limit: int = 200) -> list[dict]:
    """Queued (not yet dispatched) messages, oldest first."""
    conn = connect(settings)
    try:
        rows = conn.execute(
            """SELECT id, person, network, text, scheduled_at AS time, status, attachments,
                      created_at
               FROM messages WHERE status IN ('pending', 'dispatched', 'dispatching')
               ORDER BY scheduled_at ASC LIMIT ?""",
            (limit,),
        ).fetchall()
    finally:
        conn.close()
    jobs = []
    for row in rows:
        job = dict(row)
        job["time"] = _sql_to_iso(job["time"])
        job["created_at"] = _sql_to_iso(job["created_at"])
        try:
            job["attachments"] = json.loads(job.get("attachments") or "[]")
        except ValueError:
            job["attachments"] = []
        jobs.append(job)
    return jobs


def list_history(settings: Settings | None = None, limit: int | None = None) -> list[dict]:
    settings = settings or load_settings()
    limit = limit or settings.history_limit
    conn = connect(settings)
    try:
        rows = conn.execute(
            "SELECT * FROM history ORDER BY id DESC LIMIT ?", (limit,)
        ).fetchall()
    finally:
        conn.close()
    out = []
    for row in rows:
        entry = dict(row)
        for key in ("time", "created_at"):
            entry[key] = _sql_to_iso(entry.get(key))
        out.append(entry)
    return out


def delete_history_entry(entry_id: int, settings: Settings | None = None) -> dict:
    conn = connect(settings)
    try:
        cursor = conn.execute("DELETE FROM history WHERE id = ?", (entry_id,))
        conn.commit()
        return {"status": "deleted" if cursor.rowcount else "not_found", "id": entry_id}
    finally:
        conn.close()


def _prune_history(conn: sqlite3.Connection, limit: int) -> None:
    conn.execute(
        "DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT ?)",
        (limit,),
    )


# --- Dispatch --------------------------------------------------------------


def _due_rows(conn: sqlite3.Connection, limit: int) -> list[dict]:
    rows = conn.execute(
        """SELECT id, person, network, text, scheduled_at, created_at, attachments
           FROM messages
           WHERE status IN ('pending', 'dispatched') AND scheduled_at <= datetime('now')
           ORDER BY scheduled_at ASC LIMIT ?""",
        (limit,),
    ).fetchall()
    return [dict(r) for r in rows]


def _resolve_target(conn: sqlite3.Connection, msg: dict, settings: Settings) -> str:
    """Contact identifier if we know one, else the stored person value."""
    target = msg["person"]
    row = conn.execute(
        "SELECT identifier FROM contacts WHERE name = ? AND network = ? LIMIT 1",
        (msg["person"], msg["network"]),
    ).fetchone()
    if row and row["identifier"]:
        target = row["identifier"]

    account = BEEPER_PLATFORMS.get(msg["network"])
    if account and target and not target.startswith("!"):
        result = call_bridge(
            "create-chat",
            {"accountID": account, "participantID": f"@{account}_{target}:beeper.local"},
            settings,
        )
        chat_id = (result or {}).get("chat_id", "")
        if chat_id:
            conn.execute(
                "UPDATE contacts SET identifier = ? WHERE name = ? AND network = ?",
                (chat_id, msg["person"], msg["network"]),
            )
            target = chat_id
    return target


def dispatch_due(settings: Settings | None = None, limit: int | None = None,
                 now: float | None = None, dry_run: bool = False) -> dict:
    """Send every due message. Returns a per-message report.

    Rules carried over verbatim from ``api.py``:

    * a message more than ``grace_seconds`` past due *and* created before that
      window is recorded as ``missed`` (the process was down when it was due)
      rather than sent late;
    * the target is the contact's identifier when known, else the stored person;
    * Beeper-bridged networks get their chat created on demand and the id is
      written back onto the contact;
    * success is exactly ``result.get("status") == "sent"``; anything else is a
      failure carrying the bridge's error text;
    * history keeps the last ``history_limit`` rows.
    """
    settings = settings or load_settings()
    limit = limit or settings.dispatch_limit
    now = now if now is not None else time.time()

    report: dict[str, Any] = {"scanned": 0, "sent": [], "failed": [], "missed": [], "dry_run": dry_run}
    pending_notifications: list[tuple[str, str, str, str, str]] = []
    conn = connect(settings)
    try:
        rows = _due_rows(conn, limit)
        report["scanned"] = len(rows)
        for msg in rows:
            try:
                scheduled_ts = datetime.fromisoformat(msg["scheduled_at"]).replace(
                    tzinfo=timezone.utc).timestamp()
                created_ts = datetime.fromisoformat(msg["created_at"]).replace(
                    tzinfo=timezone.utc).timestamp()
            except ValueError:
                scheduled_ts = created_ts = now

            if (now - scheduled_ts) > settings.grace_seconds and (now - created_ts) > settings.grace_seconds:
                report["missed"].append({"id": msg["id"], "person": msg["person"]})
                if not dry_run:
                    conn.execute(
                        """INSERT INTO history (person, network, text, status, time, error)
                           VALUES (?, ?, ?, 'missed', ?, 'missed during downtime')""",
                        (msg["person"], msg["network"], msg["text"], msg["scheduled_at"]),
                    )
                    conn.execute("DELETE FROM messages WHERE id = ?", (msg["id"],))
                continue

            if dry_run:
                report["sent"].append({"id": msg["id"], "person": msg["person"],
                                       "network": msg["network"]})
                continue

            target = _resolve_target(conn, msg, settings)
            try:
                attachments = json.loads(msg.get("attachments") or "[]")
            except ValueError:
                attachments = []

            result = call_bridge("send", {"network": msg["network"], "person": target,
                                          "text": msg["text"], "attachments": attachments},
                                 settings)
            ok = result.get("status") == "sent"
            error = result.get("error", "") if not ok else ""
            status = "sent" if ok else "failed"

            conn.execute(
                """INSERT INTO history (person, network, text, status, time, error)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (msg["person"], msg["network"], msg["text"], status,
                 msg["scheduled_at"], error),
            )
            conn.execute(
                "UPDATE messages SET status = ?, error = ?, dispatched_at = ? WHERE id = ?",
                (status, error, utcnow_sql(), msg["id"]),
            )
            conn.execute("DELETE FROM messages WHERE id = ?", (msg["id"],))
            report["sent" if ok else "failed"].append(
                {"id": msg["id"], "person": msg["person"], "network": msg["network"],
                 "error": error}
            )
            pending_notifications.append(
                (status, msg["person"], msg["network"], msg["text"], msg["scheduled_at"])
            )
            cleanup_message_media(msg["text"], settings)

        if not dry_run:
            _prune_history(conn, settings.history_limit)
            conn.commit()
    finally:
        conn.close()

    # Notify outside the transaction: a slow bridge must not hold the DB open.
    for status, person, network, text, scheduled_at in pending_notifications:
        send_notification(status, person, network, text, scheduled_at, settings)
    return report


def claim_outgoing(settings: Settings | None = None, limit: int | None = None) -> list[dict]:
    """Claim up to ``limit`` due messages for an external dispatcher.

    Kept for the "host cron does the sending" topology: the caller reports each
    result back through :func:`report_result`. There is no lease expiry — a
    crashed external dispatcher would strand rows in ``dispatching``; call
    :func:`release_stranded` to put them back.
    """
    settings = settings or load_settings()
    limit = limit or settings.dispatch_limit
    conn = connect(settings)
    try:
        ids = [r["id"] for r in conn.execute(
            """SELECT id FROM messages
               WHERE status IN ('pending', 'dispatched') AND scheduled_at <= datetime('now')
               ORDER BY scheduled_at ASC LIMIT ?""",
            (limit,),
        ).fetchall()]
        claimed = []
        for job_id in ids:
            conn.execute("UPDATE messages SET status = 'dispatching' WHERE id = ?", (job_id,))
            row = conn.execute(
                """SELECT id, person, network, text, scheduled_at, attachments
                   FROM messages WHERE id = ?""",
                (job_id,),
            ).fetchone()
            claimed.append(dict(row))
        conn.commit()
    finally:
        conn.close()
    for job in claimed:
        try:
            job["attachments"] = json.loads(job.get("attachments") or "[]")
        except ValueError:
            job["attachments"] = []
    return claimed


def release_stranded(settings: Settings | None = None) -> int:
    """Return claimed-but-never-reported rows to the queue."""
    conn = connect(settings)
    try:
        cursor = conn.execute(
            "UPDATE messages SET status = 'dispatched' WHERE status = 'dispatching'"
        )
        conn.commit()
        return cursor.rowcount
    finally:
        conn.close()


def report_result(job_id: int, status: str, error: str = "",
                  settings: Settings | None = None) -> dict:
    """Record the outcome of a message an external dispatcher sent."""
    if status not in TERMINAL_HISTORY_STATES:
        raise ValueError(f"status must be one of {TERMINAL_HISTORY_STATES}")
    settings = settings or load_settings()
    conn = connect(settings)
    try:
        row = conn.execute("SELECT * FROM messages WHERE id = ?", (job_id,)).fetchone()
        if not row:
            return {"status": "not_found", "id": job_id}
        msg = dict(row)
        conn.execute(
            "INSERT INTO history (person, network, text, status, time, error) VALUES (?, ?, ?, ?, ?, ?)",
            (msg["person"], msg["network"], msg["text"], status, msg["scheduled_at"], error),
        )
        conn.execute("DELETE FROM messages WHERE id = ?", (job_id,))
        _prune_history(conn, settings.history_limit)
        conn.commit()
    finally:
        conn.close()
    return {"status": "recorded", "id": job_id}


# --- Contacts --------------------------------------------------------------


def list_contacts(settings: Settings | None = None) -> list[dict]:
    """Contacts aggregated by name — one person, all their platforms."""
    conn = connect(settings)
    try:
        rows = conn.execute(
            "SELECT id, name, network, identifier FROM contacts ORDER BY name ASC"
        ).fetchall()
    finally:
        conn.close()
    people: dict[str, dict] = {}
    for row in rows:
        person = people.setdefault(row["name"], {"name": row["name"], "networks": []})
        person["networks"].append({
            "id": row["id"],
            "network": (row["network"] or "").lower(),
            "identifier": row["identifier"] or "",
        })
    return list(people.values())


def find_contacts(query: str, settings: Settings | None = None, limit: int = 10) -> list[dict]:
    """Name search for the agent and the compose box's autocomplete."""
    query = (query or "").strip()
    if not query:
        return []
    conn = connect(settings)
    try:
        rows = conn.execute(
            """SELECT id, name, network, identifier FROM contacts
               WHERE name LIKE ? COLLATE NOCASE
               ORDER BY CASE WHEN name LIKE ? COLLATE NOCASE THEN 0 ELSE 1 END, name ASC
               LIMIT ?""",
            (f"%{query}%", f"{query}%", limit),
        ).fetchall()
    finally:
        conn.close()
    out: dict[str, dict] = {}
    for row in rows:
        person = out.setdefault(row["name"], {"name": row["name"], "networks": []})
        person["networks"].append({"id": row["id"], "network": (row["network"] or "").lower(),
                                   "identifier": row["identifier"] or ""})
    return list(out.values())


def add_contact(name: str, network: str, identifier: str = "", source: str = "manual",
                settings: Settings | None = None) -> dict:
    conn = connect(settings)
    try:
        cursor = conn.execute(
            "INSERT INTO contacts (name, network, identifier, source) VALUES (?, ?, ?, ?)",
            (name, network, identifier, source),
        )
        conn.commit()
        return {"status": "created", "id": cursor.lastrowid}
    finally:
        conn.close()


def update_contact(contact_id: int, name: str | None = None, network: str | None = None,
                   identifier: str | None = None, settings: Settings | None = None) -> dict:
    fields, values = [], []
    for column, value in (("name", name), ("network", network), ("identifier", identifier)):
        if value is not None:
            fields.append(f"{column} = ?")
            values.append(value)
    if not fields:
        return {"status": "noop"}
    conn = connect(settings)
    try:
        values.append(contact_id)
        cursor = conn.execute(f"UPDATE contacts SET {', '.join(fields)} WHERE id = ?", values)
        conn.commit()
        return {"status": "updated" if cursor.rowcount else "not_found", "id": contact_id}
    finally:
        conn.close()


def delete_contact(contact_id: int, settings: Settings | None = None) -> dict:
    conn = connect(settings)
    try:
        cursor = conn.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
        conn.commit()
        return {"status": "deleted" if cursor.rowcount else "not_found", "id": contact_id}
    finally:
        conn.close()


def import_contacts(contacts: Iterable[dict], source: str = "sync",
                    settings: Settings | None = None) -> dict:
    """Replace every contact of ``source`` with the supplied set (as api.py did)."""
    conn = connect(settings)
    try:
        conn.execute("DELETE FROM contacts WHERE source = ?", (source,))
        inserted = 0
        for contact in contacts:
            name = (contact.get("name") or "").strip()
            network = (contact.get("network") or "").strip()
            if not name or not network:
                continue
            conn.execute(
                "INSERT INTO contacts (name, network, identifier, source) VALUES (?, ?, ?, ?)",
                (name, network, contact.get("identifier", "") or "", source),
            )
            inserted += 1
        conn.commit()
        return {"status": "imported", "inserted": inserted, "source": source}
    finally:
        conn.close()


# --- Templates -------------------------------------------------------------


def list_templates(settings: Settings | None = None) -> list[dict]:
    conn = connect(settings)
    try:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM templates ORDER BY id DESC").fetchall()]
    finally:
        conn.close()


def add_template(name: str, person: str = "", network: str = "", text: str = "",
                 settings: Settings | None = None) -> dict:
    conn = connect(settings)
    try:
        cursor = conn.execute(
            "INSERT INTO templates (name, person, network, text) VALUES (?, ?, ?, ?)",
            (name, person, network, text),
        )
        conn.commit()
        return {"status": "created", "id": cursor.lastrowid}
    finally:
        conn.close()


def delete_template(template_id: int, settings: Settings | None = None) -> dict:
    conn = connect(settings)
    try:
        cursor = conn.execute("DELETE FROM templates WHERE id = ?", (template_id,))
        conn.commit()
        return {"status": "deleted" if cursor.rowcount else "not_found", "id": template_id}
    finally:
        conn.close()


# --- Bridge proxies (kept 1:1 with the old API) ----------------------------


def sync_contacts(network: str, settings: Settings | None = None) -> dict:
    return {"status": "sync_done", **(call_bridge("sync", {"network": network}, settings) or {})}


def generate_text(prompt: str, settings: Settings | None = None) -> dict:
    if not (prompt or "").strip():
        return {"status": "error", "error": "missing prompt"}
    return call_bridge("generate", {"prompt": prompt}, settings)


def search_beeper(query: str, settings: Settings | None = None) -> dict:
    query = (query or "").strip()
    if len(query) < 2:
        return {"results": []}
    return call_bridge("search-beeper", {"query": query}, settings)


def create_chat(account_id: str, participant_id: str, settings: Settings | None = None) -> dict:
    if not account_id or not participant_id:
        return {"status": "failed", "error": "missing fields"}
    return call_bridge("create-chat",
                       {"accountID": account_id, "participantID": participant_id}, settings)


# --- Stats -----------------------------------------------------------------


def summary(settings: Settings | None = None) -> dict:
    """Queue/contact counts — what the desktop badge and the dashboard header read."""
    settings = settings or load_settings()
    conn = connect(settings)
    try:
        queued = conn.execute(
            "SELECT COUNT(*) AS n FROM messages WHERE status IN ('pending', 'dispatched', 'dispatching')"
        ).fetchone()["n"]
        due = conn.execute(
            """SELECT COUNT(*) AS n FROM messages
               WHERE status IN ('pending', 'dispatched') AND scheduled_at <= datetime('now')"""
        ).fetchone()["n"]
        next_row = conn.execute(
            """SELECT MIN(scheduled_at) AS t FROM messages
               WHERE status IN ('pending', 'dispatched')"""
        ).fetchone()["t"]
        contacts = conn.execute("SELECT COUNT(*) AS n FROM contacts").fetchone()["n"]
        sent = conn.execute("SELECT COUNT(*) AS n FROM history WHERE status = 'sent'").fetchone()["n"]
        failed = conn.execute("SELECT COUNT(*) AS n FROM history WHERE status = 'failed'").fetchone()["n"]
        missed = conn.execute("SELECT COUNT(*) AS n FROM history WHERE status = 'missed'").fetchone()["n"]
    finally:
        conn.close()
    return {
        "queued": queued,
        "due_now": due,
        "next_at": _sql_to_iso(next_row),
        "contacts": contacts,
        "history": {"sent": sent, "failed": failed, "missed": missed},
        "db_path": str(settings.db_path),
        "media_dir": str(settings.media_dir),
        "bridge_url": settings.bridge_url,
    }
