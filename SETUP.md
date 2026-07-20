# Message Scheduler — Setup Tutorial

A self-hosted web app to schedule and send messages across Telegram, WhatsApp, and other platforms. Single Docker container, no external databases, no vendor lock-in.

---

## Quick Start (5 minutes)

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/message-scheduler.git
cd message-scheduler

# 2. Configure
cp .env.example .env
# Edit .env — set at minimum TELEGRAM_BOT_TOKEN

# 3. Launch
docker compose up -d
```

Open **http://localhost:9119** and start scheduling messages.

---

## Prerequisites

| Requirement | Why | How to get it |
|---|---|---|
| **Docker + Compose** | Runs the container | `docker --version` — install from [docker.com](https://docs.docker.com/engine/install/) |
| **Telegram Bot Token** | Required for sending messages | Talk to [@BotFather](https://t.me/BotFather) on Telegram |
| **Port 9119 free** | Web UI and API | `ss -tlnp \| grep 9119` — change via `PORT` env var |

Everything else (SQLite, Node.js, Python, React frontend) is baked into the Docker image.

---

## Step 1 — Get a Telegram Bot Token

1. Open Telegram and search for **@BotFather**
2. Send `/newbot` and follow the prompts
3. BotFather will give you a token like: `7234567890:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw`
4. Copy this token — you'll need it for `.env`

> **Why Telegram?** The scheduler can send directly via the Telegram Bot API without any extra infrastructure. Other platforms (WhatsApp, Beeper) need additional bridge services — see the Advanced Setup section.

---

## Step 2 — Configure

Copy the template and edit:

```bash
cp .env.example .env
nano .env   # or vim, code, etc.
```

### Essential config

```ini
# You MUST set this for messages to send
TELEGRAM_BOT_TOKEN=7234567890:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw
```

### Optional configs

```ini
# Public URL of your scheduler (for file attachments)
# If running locally: http://localhost:9119
# If behind a reverse proxy: https://scheduler.yourdomain.com
SCHEDULER_BASE_URL=http://localhost:9119

# Hermes bridge — see Advanced Setup
# HERMES_BRIDGE_URL=http://host.docker.internal:9190

# Beeper Desktop — see Advanced Setup
# BEEPER_TOKEN=
# BEEPER_URL=http://127.0.0.1:23373
```

---

## Step 3 — Launch

```bash
docker compose up -d
```

Check it's running:

```bash
curl http://localhost:9119/
# Should return 200 — the React SPA loads here

curl http://localhost:9119/api/platforms/status
# Shows which messaging platforms are connected
```

Open **http://localhost:9119** in your browser. You'll see the Compose tab with:
- Recipient autocomplete
- Network dropdown (Telegram, WhatsApp, etc.)
- Date/time picker
- Message editor with formatting toolbar (Bold, Italic, Link, Code, Emoji, Preview)
- Attach Media button
- AI Compose button

---

## Step 4 — Import Contacts

The scheduler needs contacts to send to. You have several options:

### Option A: Add contacts manually

In the **Settings** tab, click **Add Contact** and fill in the name, platform, and identifier (phone number, Telegram chat ID, etc.).

### Option B: Import via API

```bash
curl -X POST http://localhost:9119/api/contacts/import \
  -H "Content-Type: application/json" \
  -d '{
    "source": "manual",
    "contacts": [
      {"name": "Alice", "network": "telegram", "identifier": "123456789"},
      {"name": "Bob", "network": "whatsapp", "identifier": "+351912345678"}
    ]
  }'
```

### Option C: Birthday DB format

If you have a SQLite database with columns `name`, `telegram_chat_id`, `whatsapp_chat_id`, etc., set `BIRTHDAY_DB` in `.env` and click **Force Sync** in Settings.

### Option D: Beeper sync

If you have Beeper Desktop running, see the Advanced Setup section.

---

## Step 5 — Schedule Your First Message

1. In the **Compose** tab, type a contact name (autocomplete will suggest matches)
2. Select a network (Telegram, WhatsApp, etc.)
3. Pick a date and time (or use quick pills: In 1 Hour, Tomorrow, Friday)
4. Type your message in the editor
5. Click **Schedule Message**

The message appears in the **Queue** tab with a countdown timer. When the time comes, it's dispatched automatically and moved to **History**.

---

## How It Works (Architecture)

```
User's Browser                  Docker Container                   External
┌─────────────┐               ┌──────────────────────┐        ┌──────────────┐
│  React SPA   │ ◄─HTTP:9119─►│   FastAPI Backend    │ ──────►│ Telegram Bot │
│  (Compose,   │              │   + SQLite Queue     │  API   │   API        │
│   Queue,     │              │                      │        └──────────────┘
│   History,   │              │  ┌──────────────────┐│
│   Settings)  │              │  │ Background       ││        ┌──────────────┐
└─────────────┘              │  │ Dispatcher       ││ ──────►│ Hermes Bridge│
                              │  │ (every 10 sec)   ││  HTTP  │ (optional)   │
                              │  └──────────────────┘│        └──────────────┘
                              │                      │
                              │  /tmp/hermes_        │        ┌──────────────┐
                              │  scheduler_media/    │ ──────►│ Beeper       │
                              │  (uploaded files)    │  API   │ Desktop API  │
                              └──────────────────────┘        └──────────────┘
```

**The dispatcher** runs inside the container as a background thread. Every 10 seconds it:
1. Checks for due messages: `WHERE status IN ('pending','dispatched') AND scheduled_at <= datetime('now')`
2. Looks up the contact identifier in the contacts table
3. Calls the appropriate send method based on the network
4. Writes the result to the history table
5. Cleans up media files referenced in the message

---

## File Attachments

The scheduler supports sending files natively (not as links) for all supported platforms.

**How it works:**
1. Click **Attach Media** in the Compose tab
2. Select one or more files (images, videos, audio, PDFs, documents)
3. Files are uploaded to `/tmp/hermes_scheduler_media/` inside the container
4. When the message is dispatched, the file is downloaded and sent natively:
   - **Telegram**: Via Bot API `sendDocument` with multipart upload
   - **WhatsApp**: Via the WhatsApp bridge's `/send-media` endpoint
   - **Beeper**: Uploaded to Beeper via `POST /v1/assets/upload`, then sent with the message

Files older than 30 days are automatically cleaned up.

---

## Advanced Setup

### Hermes Agent Integration (Multi-Platform Sending)

The scheduler sends Telegram messages directly via the Bot API. For **WhatsApp, Discord, Signal, Facebook, Instagram, LinkedIn**, and other platforms, you need **Hermes Agent** — an open-source AI agent framework that includes native messaging bridges for all these platforms.

#### Step 1 — Install Hermes Agent

```bash
# Requires Python 3.11+ and Node.js 20+
pip install hermes-agent

# Or install from source:
git clone https://github.com/nousresearch/hermes-agent.git
cd hermes-agent
pip install -e .
```

Full install docs: [hermes-agent.nousresearch.com/docs](https://hermes-agent.nousresearch.com/docs)

#### Step 2 — Set Up Platforms

Each platform needs to be configured within Hermes. Run the setup wizard:

```bash
hermes setup
```

Or configure platforms individually:

**Telegram** (already handled by the scheduler directly — optional for Hermes):
```bash
hermes set TELEGRAM_BOT_TOKEN=your_token
```

**WhatsApp** (requires a phone number and QR scan):
```bash
hermes whatsapp
# Scans QR code with your phone → WhatsApp Web session
```

**Discord:**
```bash
hermes set DISCORD_BOT_TOKEN=your_token
```

Other platforms (Signal, Facebook, etc.) follow similar patterns — see the Hermes docs for each.

#### Step 3 — Install the Bridge Script

The bridge is a lightweight HTTP server that relays send requests from the scheduler to Hermes.

Save this as `hermes_bridge.py` on your host machine:

```python
#!/usr/bin/env python3
"""
Hermes Bridge — relays messages from the Message Scheduler to Hermes Agent.
Listens on port 9190 (configurable via BRIDGE_PORT env var).
"""
import json
import os
import subprocess
import sys
import time
import urllib.request
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs

HERMES_BIN = "hermes"  # Assumes hermes is in PATH
SCRIPTS_DIR = os.path.dirname(os.path.abspath(__file__))


class BridgeHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        print(f"[bridge] {format % args}", flush=True)

    def _send_json(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length) if length else b"{}"
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            self._send_json(400, {"error": "invalid json"})
            return

        if self.path == "/send":
            network = data.get("network", "")
            person = data.get("person", "")
            text = data.get("text", "")
            if not network or not person:
                self._send_json(400, {"error": "missing network, person"})
                return

            is_phone = person.startswith("+") and person[1:].replace(" ", "").isdigit()
            target = f"{network}:{person}" if (person.isdigit() or is_phone) else network

            r = subprocess.run(
                [HERMES_BIN, "send", "--to", target],
                input=text, capture_output=True, text=True, timeout=30
            )
            if r.returncode == 0:
                self._send_json(200, {"status": "sent"})
            else:
                self._send_json(200, {"status": "failed", "error": r.stderr[:500] or r.stdout[:500]})

        elif self.path == "/sync":
            network = data.get("network", "")
            sync_script = os.path.join(SCRIPTS_DIR, "sync_contacts.py")
            if os.path.exists(sync_script):
                cmd = [sys.executable, sync_script, "--json"]
                if network:
                    cmd.extend(["--network", network])
                try:
                    r = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
                    if r.returncode == 0:
                        last_line = [l for l in r.stdout.strip().split("\n") if l.strip()][-1]
                        self._send_json(200, json.loads(last_line))
                    else:
                        self._send_json(200, {"status": "sync_done", "imported": 0, "error": r.stderr[:300]})
                except subprocess.TimeoutExpired:
                    self._send_json(200, {"status": "sync_done", "imported": 0, "note": "sync timed out"})
            else:
                self._send_json(200, {"status": "sync_done", "imported": 0})

        elif self.path == "/status":
            # Return which platforms Hermes has configured
            platforms = {
                "telegram": {"connected": bool(os.environ.get("TELEGRAM_BOT_TOKEN"))},
                "whatsapp": {"connected": True},  # Assume connected if hermes whatsapp was set up
                "sms": {"connected": True},
                "email": {"connected": True},
                "discord": {"connected": bool(os.environ.get("DISCORD_BOT_TOKEN"))},
                "beeper": {"connected": bool(os.environ.get("BEEPER_TOKEN"))},
            }
            self._send_json(200, {"platforms": platforms})

        elif self.path == "/health":
            self._send_json(200, {"status": "ok"})

        else:
            self._send_json(404, {"error": "not found"})


if __name__ == "__main__":
    port = int(os.environ.get("BRIDGE_PORT", "9190"))
    server = HTTPServer(("0.0.0.0", port), BridgeHandler)
    print(f"Bridge listening on 0.0.0.0:{port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()
```

#### Step 4 — Run the Bridge

```bash
# Quick test
python3 hermes_bridge.py

# For production (Linux) — systemd user service:
mkdir -p ~/.config/systemd/user

cat > ~/.config/systemd/user/hermes-bridge.service << 'EOF'
[Unit]
Description=Message Scheduler Bridge
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 /path/to/hermes_bridge.py
WorkingDirectory=/path/to/
Restart=on-failure
RestartSec=5
Environment=BRIDGE_PORT=9190

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now hermes-bridge
```

Make sure to replace `/path/to/` with the actual directory path.

#### Step 5 — Connect the Scheduler

Add to your `.env`:

```ini
HERMES_BRIDGE_URL=http://host.docker.internal:9190
```

On Linux, `host.docker.internal` resolves to the host machine automatically. If it doesn't work on your system, use your host's LAN IP address instead:

```ini
HERMES_BRIDGE_URL=http://192.168.1.100:9190
```

Restart the scheduler:

```bash
docker compose down && docker compose up -d
```

#### Step 6 — Verify

Check the scheduler's **Settings** tab — the **Platform Status** section should show which platforms are connected. Test by scheduling a message to WhatsApp or another configured platform.

### WhatsApp-Specific Setup (via Hermes)

WhatsApp requires pairing via QR code through Hermes:

```bash
hermes whatsapp
# A QR code appears — scan it with your WhatsApp app
# (Settings → Linked Devices → Link a Device)
```

The WhatsApp bridge runs as a background process on port 3000. It must stay running for WhatsApp sends to work. If you restart your machine, re-run `hermes whatsapp` or set it up as a systemd service.

### Advanced Telegram Sending

The scheduler sends Telegram messages directly via the Bot API — this is faster and more reliable than routing through Hermes. It supports:
- **Text messages** via `sendMessage` with HTML formatting
- **File attachments** via `sendDocument` with multipart upload
- **Captions** — text is sent as the caption on the first file

To use only the Telegram Bot API (no Hermes needed), you don't need to set `HERMES_BRIDGE_URL` at all.

### Beeper Contact Sync

If you use Beeper Desktop, you can sync contacts from all your bridged platforms (WhatsApp, Telegram, Facebook, Instagram, LinkedIn, Discord, Signal, Google Messages).

**Requirements:**
- Beeper Desktop running (headless is fine)
- Beeper Desktop API enabled (Settings → Developer → Enable API)
- An API token from the Developer settings page

**Setup:**
```ini
# In .env
BEEPER_TOKEN=your_beeper_api_token
BEEPER_URL=http://127.0.0.1:23373
```

Then click **Force Sync** or **Rescan [Beeper]** in Settings.

### Google Contacts Sync

If you have Google OAuth set up with the `contacts.readonly` scope:

```bash
# The scheduler uses google_api.py from the Hermes skills:
python3 google_api.py contacts list --max 2000
```

Enable Google_Contacts in Settings and click Rescan.

### Reverse Proxy (NGINX example)

```nginx
server {
    listen 443 ssl;
    server_name scheduler.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:9119;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

---

## Environment Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | **Yes** | — | Telegram Bot API token for sending |
| `SCHEDULER_BASE_URL` | No | `http://localhost:9119` | Public URL for file attachment serving |
| `HERMES_BRIDGE_URL` | No | `http://host.docker.internal:9190` | Bridge for multi-platform sends |
| `BIRTHDAY_DB` | No | — | Path to birthday contacts SQLite DB |
| `BEEPER_TOKEN` | No | — | Beeper Desktop API token |
| `BEEPER_URL` | No | `http://127.0.0.1:23373` | Beeper Desktop API URL |
| `PORT` | No | `9119` | HTTP listen port |
| `MESSAGE_SCHEDULER_DB` | No | `/app/data/scheduler.db` | SQLite DB path |

---

## File Structure

```
scheduler/
├── api.py              # FastAPI backend
├── Dockerfile          # Multi-stage Docker build
├── docker-compose.yml  # Docker deployment
├── .env.example        # Configuration template
├── requirements.txt    # Python dependencies
├── web/                # React + TypeScript frontend
│   └── src/
│       ├── App.tsx
│       └── components/
│           ├── ComposeTab.tsx         # Message composition
│           ├── QueueTab.tsx           # Pending jobs
│           ├── HistoryTab.tsx         # Sent/failed log
│           ├── SettingsTab.tsx        # Config + contact sync
│           └── ContactAutocomplete.tsx
└── tests/
    └── test_backend.py
```

---

## Troubleshooting

### "Messages aren't sending"

1. Check the scheduler logs: `docker logs message-scheduler`
2. Check the bridge logs: `journalctl --user -u hermes-bridge`
3. Verify your Telegram Bot Token is correct in `.env`
4. Check the History tab — it shows the error message for failed sends

### "No contacts in the dropdown"

Run a contact sync:
- Click **Force Sync** in Settings
- Or import via API (see Step 4)
- Or add contacts manually in Settings

### "File uploads aren't working"

- Files are stored inside the container at `/tmp/hermes_scheduler_media/`
- For persistent storage, mount a volume: `-v ./uploads:/tmp/hermes_scheduler_media`
- Files are auto-cleaned after 30 days

### "WhatsApp sends fail"

WhatsApp requires the Hermes bridge to be running on the host (see Advanced Setup). The WhatsApp bridge (Baileys) runs as a separate Node.js process on port 3000.

### "Beeper can't send"

Beeper needs:
1. Beeper Desktop running with API enabled
2. A valid `BEEPER_TOKEN` in `.env`
3. The Beeper Desktop API reachable from the bridge

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | React SPA |
| `GET` | `/api/jobs` | List pending jobs |
| `POST` | `/api/schedule` | Schedule a message |
| `POST` | `/api/send` | Send immediately |
| `DELETE` | `/api/jobs/{id}` | Cancel a job |
| `GET` | `/api/history` | Message history |
| `DELETE` | `/api/history/{id}` | Delete history entry |
| `GET` | `/api/templates` | List templates |
| `POST` | `/api/templates` | Create template |
| `DELETE` | `/api/templates/{id}` | Delete template |
| `GET` | `/api/contacts` | List contacts |
| `POST` | `/api/contacts` | Add contact |
| `DELETE` | `/api/contacts/{id}` | Delete contact |
| `POST` | `/api/contacts/import` | Bulk import contacts |
| `POST` | `/api/contacts/sync/{network}` | Trigger rescan for a platform |
| `POST` | `/api/upload` | Upload a file |
| `GET` | `/api/media/{filename}` | Download uploaded file |
| `GET` | `/api/platforms/status` | Platform connection status |
| `GET` | `/api/config` | Bridge config info |
| `POST` | `/api/generate` | AI text generation |

---

## Development

```bash
# Backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn api:app --reload --port 9119

# Frontend
cd web && npm install && npm run dev

# Full Docker build
docker build -t message-scheduler:latest .
```

```bash
# Run tests
pytest tests/ -v
```

---

## License

MIT
