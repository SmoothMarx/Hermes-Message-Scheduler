import sqlite3
import os
import time
import threading
import json
import re
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="Message Scheduler")

# --- Config ----------------------------------------------------------------
DB_PATH = os.environ.get("MESSAGE_SCHEDULER_DB", "data/scheduler.db")
STATIC_DIR = os.environ.get("MESSAGE_SCHEDULER_STATIC", "web/dist")
HERMES_BRIDGE_URL = os.environ.get("HERMES_BRIDGE_URL", "http://host.docker.internal:9190")
MEDIA_DIR = "/tmp/hermes_scheduler_media"

# --- CORS ------------------------------------------------------------------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Database --------------------------------------------------------------

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn

def init_db():
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    conn = get_db()
    cursor = conn.cursor()
    cursor.executescript("""
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
    """)
    # Migrate: add attachments column if missing
    try:
        cursor.execute("ALTER TABLE messages ADD COLUMN attachments TEXT DEFAULT '[]'")
    except sqlite3.OperationalError:
        pass  # column already exists
    conn.commit()
    conn.close()

# --- Pydantic Models -------------------------------------------------------

class TemplateCreate(BaseModel):
    name: str
    person: str = ""
    network: str = ""
    text: str = ""

class ScheduleRequest(BaseModel):
    person: str
    network: str
    time: str  # ISO 8601
    text: str
    replace_id: Optional[int] = None
    attachments: Optional[list[str]] = None  # list of URLs or paths

class OutgoingMessage(BaseModel):
    """Minimal model for outgoing message data."""
    id: int
    person: str
    network: str
    text: str
    scheduled_at: str
    attachments: Optional[list[str]] = None

class OutgoingResult(BaseModel):
    status: str  # "sent" or "failed"
    error: str = ""
    job_id: Optional[str] = None

class ContactCreate(BaseModel):
    name: str
    network: str
    identifier: str = ""

class ContactImport(BaseModel):
    contacts: list[ContactCreate]
    source: str = "sync"

# --- Background Dispatcher -------------------------------------------------

_last_outgoing_check = 0
_outgoing_lock = threading.Lock()


def normalize_time(iso_str: str) -> str:
    """Convert ISO 8601 datetime to SQLite-compatible format (YYYY-MM-DD HH:MM:SS)."""
    dt = datetime.fromisoformat(iso_str.replace("Z", "+00:00"))
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def call_bridge(method: str, payload: dict) -> dict:
    """Call the Hermes bridge on the host and return the response."""
    url = f"{HERMES_BRIDGE_URL}/{method}"
    data = json.dumps(payload).encode()
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return json.loads(resp.read().decode())
    except Exception as e:
        return {"status": "bridge_error", "error": str(e)}


def cleanup_message_media(text: str):
    """Delete media files referenced in message text via [Attachment: /path]."""
    for match in re.finditer(r'\[Attachment:\s*(.+?)\]', text):
        path = match.group(1).strip()
        if path.startswith("/") and os.path.exists(path):
            try:
                os.remove(path)
            except OSError:
                pass


def _media_cleanup_loop():
    """Background thread that removes media files older than 30 days."""
    while True:
        try:
            if os.path.isdir(MEDIA_DIR):
                now = time.time()
                cutoff = now - (30 * 86400)
                for fname in os.listdir(MEDIA_DIR):
                    fpath = os.path.join(MEDIA_DIR, fname)
                    try:
                        if os.path.isfile(fpath) and os.path.getmtime(fpath) < cutoff:
                            os.remove(fpath)
                    except OSError:
                        pass
        except Exception:
            pass
        time.sleep(3600)  # once per hour


def dispatch_due_messages():
    """Check for due messages and send them via the Hermes bridge immediately."""
    global _last_outgoing_check
    now = time.time()
    if now - _last_outgoing_check < 10:
        return
    _last_outgoing_check = now

    with _outgoing_lock:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            """SELECT id, person, network, text, scheduled_at, created_at, attachments
               FROM messages WHERE status IN ('pending', 'dispatched') AND scheduled_at <= datetime('now')
               ORDER BY scheduled_at ASC LIMIT 10"""
        )
        rows = [dict(r) for r in cursor.fetchall()]
        if not rows:
            conn.close()
            return

        for msg in rows:
            # Offline handling: if scheduled_at is more than 5 min before now,
            # and created_at is also well before now, mark as missed.
            scheduled_ts = datetime.fromisoformat(msg["scheduled_at"]).timestamp()
            created_ts = datetime.fromisoformat(msg["created_at"]).timestamp()
            now_ts = time.time()
            if (now_ts - scheduled_ts) > 300 and (now_ts - created_ts) > 300:
                # Mark as missed — message was due during a downtime window
                cursor.execute(
                    "INSERT INTO history (person, network, text, status, time, error) VALUES (?, ?, ?, ?, ?, ?)",
                    (msg["person"], msg["network"], msg["text"], "missed", msg["scheduled_at"], "missed during downtime")
                )
                cursor.execute("DELETE FROM messages WHERE id = ?", (msg["id"],))
                cleanup_message_media(msg["text"])
                continue

            # Look up contact identifier for targeted delivery
            target = msg["person"]
            cursor.execute(
                "SELECT identifier FROM contacts WHERE name = ? AND network = ? LIMIT 1",
                (msg["person"], msg["network"])
            )
            contact = cursor.fetchone()
            if contact and contact["identifier"]:
                target = contact["identifier"]

            # Beeper-bridged platforms: if the identifier is a raw platform ID (not a Beeper chat ID),
            # create the Beeper chat on-demand using the Hermes bridge
            beeper_platforms = {
                "facebook/messenger": "facebookgo",
                "facebook": "facebookgo",
                "instagram": "instagramgo",
                "linkedin": "linkedin",
            }
            if msg["network"] in beeper_platforms and target and not target.startswith("!"):
                account_id = beeper_platforms[msg["network"]]
                beeper_user = f"@{account_id}_{target}:beeper.local"
                try:
                    result = call_bridge("create-chat", {
                        "accountID": account_id,
                        "participantID": beeper_user,
                    })
                    chat_id = result.get("chat_id", "")
                    if chat_id:
                        cursor.execute(
                            "UPDATE contacts SET identifier = ? WHERE name = ? AND network = ?",
                            (chat_id, msg["person"], msg["network"])
                        )
                        target = chat_id
                except Exception:
                    pass  # Fall through — send will fail, logged in history

            # Send via bridge
            attachments_list = json.loads(msg.get("attachments", "[]"))
            bridge_payload = {
                "network": msg["network"],
                "person": target,
                "text": msg["text"],
                "attachments": attachments_list,
            }
            result = call_bridge("send", bridge_payload)
            status = "sent" if result.get("status") == "sent" else "failed"
            error = result.get("error", "")

            # Clean up media files referenced in the message
            cleanup_message_media(msg["text"])

            # Write to history
            cursor.execute(
                "INSERT INTO history (person, network, text, status, time, error) VALUES (?, ?, ?, ?, ?, ?)",
                (msg["person"], msg["network"], msg["text"], status, msg["scheduled_at"], error)
            )

            # Remove from messages queue
            cursor.execute("DELETE FROM messages WHERE id = ?", (msg["id"],))

            # Send notification about dispatch result
            send_notification(status, msg["person"], msg["network"], msg["text"], msg["scheduled_at"])

        # Prune history
        cursor.execute("DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT 200)")
        conn.commit()
        conn.close()


def _bg_dispatcher_loop():
    """Background thread that checks for due messages every 10 seconds."""
    while True:
        try:
            dispatch_due_messages()
        except Exception:
            pass
        time.sleep(10)

# --- Startup ---------------------------------------------------------------

@app.on_event("startup")
def startup_event():
    init_db()
    t = threading.Thread(target=_bg_dispatcher_loop, daemon=True)
    t.start()
    media_t = threading.Thread(target=_media_cleanup_loop, daemon=True)
    media_t.start()

# --- API Routes ------------------------------------------------------------

@app.get("/api/contacts")
def get_contacts():
    """Return contacts aggregated by name. Each person shows once with all their platforms."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT id, name, network, identifier FROM contacts ORDER BY name ASC")
    rows = cursor.fetchall()
    conn.close()

    # Aggregate by name
    people = {}
    for row in rows:
        name = row["name"]
        if name not in people:
            people[name] = {"name": name, "networks": []}
        people[name]["networks"].append({
            "id": row["id"],
            "network": row["network"].lower(),
            "identifier": row["identifier"] or ""
        })

    return {"contacts": list(people.values())}

@app.post("/api/contacts")
def add_contact(contact: ContactCreate):
    """Add a single contact to the local DB."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO contacts (name, network, identifier, source) VALUES (?, ?, ?, 'manual')",
        (contact.name, contact.network, contact.identifier)
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return {"id": new_id, **contact.model_dump()}

@app.delete("/api/contacts/{contact_id}")
def delete_contact(contact_id: int):
    """Delete a contact from the local DB."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM contacts WHERE id = ?", (contact_id,))
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    if affected == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"status": "deleted"}

@app.put("/api/contacts/{contact_id}")
def update_contact(contact_id: int, contact: ContactCreate):
    """Update a contact's network and/or identifier."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE contacts SET name = ?, network = ?, identifier = ? WHERE id = ?",
        (contact.name, contact.network, contact.identifier, contact_id)
    )
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    if affected == 0:
        raise HTTPException(status_code=404, detail="Contact not found")
    return {"status": "updated", "id": contact_id}

@app.post("/api/contacts/import")
def import_contacts(import_data: ContactImport):
    """Bulk import contacts from a sync source. Replaces existing contacts from that source."""
    conn = get_db()
    cursor = conn.cursor()

    # Remove existing contacts from this source
    cursor.execute("DELETE FROM contacts WHERE source = ?", (import_data.source,))

    # Insert new ones
    count = 0
    for c in import_data.contacts:
        cursor.execute(
            "INSERT INTO contacts (name, network, identifier, source) VALUES (?, ?, ?, ?)",
            (c.name, c.network, c.identifier, import_data.source)
        )
        count += 1

    conn.commit()
    conn.close()
    return {"imported": count, "source": import_data.source}

@app.get("/api/templates")
def get_templates():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM templates")
    rows = [dict(r) for r in cursor.fetchall()]
    conn.close()
    return {"templates": rows}

@app.post("/api/templates")
def create_template(template: TemplateCreate):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO templates (name, person, network, text) VALUES (?, ?, ?, ?)",
        (template.name, template.person, template.network, template.text)
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return {"id": new_id, **template.model_dump()}

@app.delete("/api/templates/{template_id}")
def delete_template(template_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM templates WHERE id = ?", (template_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

@app.get("/api/jobs")
def get_jobs():
    """Return all pending/dispatched messages ordered by scheduled time."""
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id, person, network, text, scheduled_at as time, status FROM messages WHERE status IN ('pending', 'dispatched') ORDER BY scheduled_at ASC"
    )
    jobs = [dict(r) for r in cursor.fetchall()]
    # Convert SQLite timestamps to ISO 8601 for proper JS parsing
    for j in jobs:
        if "time" in j and j["time"]:
            try:
                dt = datetime.fromisoformat(j["time"])
                j["time"] = dt.isoformat() + "Z"
            except ValueError:
                # Already ISO or other format — leave as-is
                pass
    conn.close()
    return {"jobs": jobs}

@app.post("/api/schedule")
def schedule_message(req: ScheduleRequest):
    """Store a scheduled message in the queue."""
    # If replace_id is provided, cancel the original job first
    if req.replace_id is not None:
        conn = get_db()
        cursor = conn.cursor()
        cursor.execute(
            "SELECT text FROM messages WHERE id = ? AND status IN ('pending', 'dispatched')",
            (req.replace_id,)
        )
        original = cursor.fetchone()
        if original:
            cursor.execute(
                "UPDATE messages SET status = 'cancelled' WHERE id = ?",
                (req.replace_id,)
            )
            cleanup_message_media(original["text"])
        conn.commit()
        conn.close()

    # Dedup: ignore identical schedule within 60 seconds
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "SELECT id FROM messages WHERE person = ? AND network = ? AND text = ? AND scheduled_at = ? AND status = 'pending'",
        (req.person, req.network, req.text, normalize_time(req.time))
    )
    if cursor.fetchone():
        conn.close()
        return {"status": "ignored_dedup"}

    attachments_json = json.dumps(req.attachments or [])
    cursor.execute(
        "INSERT INTO messages (person, network, text, scheduled_at, status, attachments) VALUES (?, ?, ?, ?, 'pending', ?)",
        (req.person, req.network, req.text, normalize_time(req.time), attachments_json)
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return {"status": "scheduled", "id": new_id}

@app.post("/api/send")
def send_now(req: ScheduleRequest):
    """Queue a message for immediate dispatch. Goes to outgoing on next poll."""
    conn = get_db()
    cursor = conn.cursor()
    now = normalize_time(datetime.now(timezone.utc).isoformat())
    attachments_json = json.dumps(req.attachments or [])
    cursor.execute(
        "INSERT INTO messages (person, network, text, scheduled_at, status, attachments) VALUES (?, ?, ?, ?, 'dispatched', ?)",
        (req.person, req.network, req.text, now, attachments_json)
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return {"status": "queued_for_immediate", "id": new_id}

@app.delete("/api/jobs/{job_id}")
def cancel_job(job_id: int):
    conn = get_db()
    cursor = conn.cursor()
    # Fetch the message text first for media cleanup
    cursor.execute("SELECT text FROM messages WHERE id = ? AND status IN ('pending', 'dispatched')", (job_id,))
    msg = cursor.fetchone()
    if not msg:
        conn.close()
        raise HTTPException(status_code=404, detail="Job not found or already dispatched")
    text = msg["text"]
    cursor.execute("UPDATE messages SET status = 'cancelled' WHERE id = ?", (job_id,))
    conn.commit()
    conn.close()
    cleanup_message_media(text)
    return {"status": "cancelled", "id": job_id}

@app.get("/api/history")
def get_history():
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM history ORDER BY id DESC LIMIT 200")
    history = [dict(r) for r in cursor.fetchall()]
    # Convert SQLite timestamps to ISO 8601
    for h in history:
        for key in ("time", "scheduled_at"):
            if key in h and h[key]:
                try:
                    dt = datetime.fromisoformat(h[key])
                    h[key] = dt.isoformat() + "Z"
                except ValueError:
                    pass
    conn.close()
    return {"history": history}

@app.delete("/api/history/{entry_id}")
def delete_history_entry(entry_id: int):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM history WHERE id = ?", (entry_id,))
    affected = cursor.rowcount
    conn.commit()
    conn.close()
    if affected == 0:
        raise HTTPException(status_code=404, detail="Entry not found")
    return {"status": "deleted"}

@app.get("/api/outgoing")
def get_outgoing():
    """
    Get messages that are due for dispatch.
    Called by the host cron job (no_agent=true Hermes cron).
    Each call claims up to 10 messages by setting status='dispatching'.
    """
    dispatch_due_messages()

    conn = get_db()
    cursor = conn.cursor()

    # Claim messages atomically
    cursor.execute(
        """UPDATE messages SET status = 'dispatching'
           WHERE id IN (
               SELECT id FROM messages WHERE status = 'dispatched' LIMIT 10
           )
           RETURNING id, person, network, text, scheduled_at
        """
    )
    rows = [dict(r) for r in cursor.fetchall()]
    conn.commit()
    conn.close()
    return {"outgoing": rows}

@app.post("/api/outgoing/{job_id}/result")
def report_outgoing_result(job_id: int, result: OutgoingResult):
    """Report the result of a dispatched message (called by host cron job)."""
    conn = get_db()
    cursor = conn.cursor()

    # Get the original message
    cursor.execute("SELECT * FROM messages WHERE id = ?", (job_id,))
    msg = cursor.fetchone()
    if not msg:
        conn.close()
        raise HTTPException(status_code=404, detail="Job not found")

    msg = dict(msg)

    # Update message status
    cursor.execute(
        "UPDATE messages SET status = ? WHERE id = ?",
        (result.status, job_id)
    )

    # Write to history
    cursor.execute(
        "INSERT INTO history (person, network, text, status, time, error) VALUES (?, ?, ?, ?, ?, ?)",
        (msg["person"], msg["network"], msg["text"], result.status, msg["scheduled_at"], result.error)
    )

    # Prune history to last 200
    cursor.execute("DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT 200)")
    conn.commit()
    conn.close()
    return {"status": "recorded"}

@app.post("/api/upload")
def upload_media(file: UploadFile = File(...)):
    upload_dir = "/tmp/hermes_scheduler_media"
    os.makedirs(upload_dir, exist_ok=True)
    # Use a safe filename to avoid collisions
    safe_name = f"{int(time.time())}_{file.filename}"
    path = os.path.join(upload_dir, safe_name)
    with open(path, "wb") as f:
        f.write(file.file.read())
    url = f"/api/media/{safe_name}"
    return {"path": path, "url": url, "name": file.filename}

@app.get("/api/media/{filename}")
def get_media(filename: str):
    """Serve uploaded media files."""
    upload_dir = "/tmp/hermes_scheduler_media"
    path = os.path.join(upload_dir, filename)
    # Prevent directory traversal
    if ".." in filename or not os.path.exists(path):
        raise HTTPException(status_code=404, detail="File not found")
    from fastapi.responses import FileResponse
    return FileResponse(path)

@app.post("/api/contacts/sync/{net}")
def sync_contacts(net: str):
    """Trigger a full contact sync immediately via the Hermes bridge."""
    result = call_bridge("sync", {"network": net})
    return {"status": "sync_done", **result}

@app.post("/api/generate")
def generate_text(data: dict):
    """Proxy AI generation requests to the Hermes bridge."""
    prompt = data.get("prompt", "")
    if not prompt:
        raise HTTPException(status_code=400, detail="missing prompt")
    result = call_bridge("generate", {"prompt": prompt})
    return result


@app.post("/api/search-beeper")
def search_beeper(data: dict):
    """Search for people on connected platforms via Beeper."""
    query = data.get("query", "").strip()
    if len(query) < 2:
        return {"results": []}
    result = call_bridge("search-beeper", {"query": query})
    return result


@app.post("/api/bridge-create-chat")
def bridge_create_chat(data: dict):
    """Create a Beeper chat via the Hermes bridge."""
    account_id = data.get("accountID", "")
    participant_id = data.get("participantID", "")
    if not account_id or not participant_id:
        return {"status": "failed", "error": "missing fields"}
    return call_bridge("create-chat", {"accountID": account_id, "participantID": participant_id})


@app.get("/api/platforms/status")
def platform_status():
    """Return per-platform connection status from the bridge."""
    return call_bridge("status", {})


@app.get("/api/config")
def get_config():
    """Return the current bridge URL for Hermes connection."""
    return {"bridge_url": HERMES_BRIDGE_URL}


# --- Notification Settings -------------------------------------------------

NOTIFY_KEY = "notify_channel"
NOTIFY_ID_KEY = "notify_identifier"
NOTIFY_USER_KEY = "notify_user_name"


def _get_setting(key: str, default: str = "") -> str:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT value FROM server_settings WHERE key = ?", (key,))
    row = cursor.fetchone()
    conn.close()
    return row["value"] if row else default


def _set_setting(key: str, value: str):
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT OR REPLACE INTO server_settings (key, value) VALUES (?, ?)",
        (key, value)
    )
    conn.commit()
    conn.close()


@app.get("/api/settings/notify")
def get_notify_settings():
    """Return current notification preferences."""
    return {
        "channel": _get_setting(NOTIFY_KEY),
        "identifier": _get_setting(NOTIFY_ID_KEY),
        "user_name": _get_setting(NOTIFY_USER_KEY, "there"),
    }


class NotifySettings(BaseModel):
    channel: str = ""
    identifier: str = ""
    user_name: str = "there"


@app.post("/api/settings/notify")
def set_notify_settings(settings: NotifySettings):
    """Save notification preferences."""
    _set_setting(NOTIFY_KEY, settings.channel)
    _set_setting(NOTIFY_ID_KEY, settings.identifier)
    _set_setting(NOTIFY_USER_KEY, settings.user_name)
    return {"status": "saved"}


def send_notification(status: str, person: str, network: str, text: str, scheduled_at: str):
    """Send a notification about message status to the configured channel."""
    channel = _get_setting(NOTIFY_KEY)
    identifier = _get_setting(NOTIFY_ID_KEY)
    user_name = _get_setting(NOTIFY_USER_KEY, "there")
    if not channel or not identifier:
        return

    # Truncate message text for the notification
    short_text = (text[:80] + "...") if len(text) > 80 else text
    time_str = scheduled_at.replace("T", " ").split(".")[0] if "T" in scheduled_at else scheduled_at

    if status == "sent":
        msg = f"Hey {user_name}, your message to {person} via {network} has been sent successfully at {time_str}"
    else:
        msg = f"Hey {user_name}, your message to {person} \"{short_text}\" has failed at {time_str}"

    call_bridge("send", {
        "network": channel,
        "person": identifier,
        "text": msg,
    })


@app.get("/api/contacts/sync-pending")
def get_sync_pending():
    """No longer needed — sync is on-demand via the bridge."""
    return {"pending": False}

# --- Static Files (React SPA) --------------------------------------------

@app.on_event("startup")
def mount_static():
    static_path = Path(STATIC_DIR)
    if static_path.exists():
        app.mount("/", StaticFiles(directory=str(static_path.resolve()), html=True), name="spa")

# --- Main ------------------------------------------------------------------

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "9120"))
    uvicorn.run(app, host="0.0.0.0", port=port)
