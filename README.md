# Message Scheduler

Schedule messages across Telegram, WhatsApp, and other platforms from a clean web UI.

- **FastAPI backend** + **React SPA** in a single Docker container
- **SQLite** storage — no external databases
- **Markdown editor** with formatting toolbar, emoji picker, and preview
- **File attachments** — upload and send files alongside messages
- **Template system** — save and reuse message templates
- **Contact management** — import from birthday DB, Beeper, Google Contacts, Telegram
- **AI compose** — generate messages via LLM prompt

## Quick Start

```bash
# 1. Get a Telegram Bot Token from @BotFather on Telegram
# 2. Run
docker compose up -d
```

Open http://localhost:9119 and start scheduling messages.

## Configuration

All config is via environment variables. Copy `.env.example` to `.env` and fill in:

| Variable | Required | Default | Description |
|---|---|---|---|
| `TELEGRAM_BOT_TOKEN` | **Yes** | — | Telegram Bot API token for sending messages |
| `HERMES_BRIDGE_URL` | No | `http://host.docker.internal:9190` | Host-side bridge for multi-platform sends |
| `SCHEDULER_BASE_URL` | No | `http://localhost:9119` | Public URL for file attachment serving |
| `BIRTHDAY_DB` | No | — | Path to birthday contacts SQLite DB |
| `BEEPER_TOKEN` | No | — | Beeper Desktop API token for contact sync |
| `BEEPER_URL` | No | `http://127.0.0.1:23373` | Beeper Desktop API URL |
| `PORT` | No | `9119` | HTTP listen port |
| `MESSAGE_SCHEDULER_DB` | No | `/app/data/scheduler.db` | SQLite database path |

## How Sending Works

```
User UI → POST /api/schedule → SQLite queue
    ↓ (every 10s)
Background dispatcher → POST /send to bridge
    ↓
Bridge → Telegram Bot API (direct) or hermes send (other platforms)
    ↓
Written to history table
```

- **Telegram**: Sent directly via Bot API (sendMessage, sendDocument)
- **Other platforms**: Forwarded to the Hermes bridge (requires `HERMES_BRIDGE_URL`)
- **File attachments**: Uploaded to `/tmp/hermes_scheduler_media/`, served via `/api/media/`. Cleared after 30 days.

## Architecture

```
┌─────────────────────┐
│   Docker Container  │
│                     │
│  ┌───────────────┐  │     ┌──────────────────┐
│  │  React SPA     │  │     │  Hermes Bridge    │
│  │  (port 9119)   │◄─┼─────┤  (host, optional) │
│  └───────┬───────┘  │     │  port 9190        │
│          │          │     └──────────────────┘
│  ┌───────▼───────┐  │
│  │  FastAPI       │  │
│  │  + SQLite      │  │
│  └───────┬───────┘  │
│          │          │
│  ┌───────▼───────┐  │
│  │  /tmp/media/   │  │
│  └───────────────┘  │
└─────────────────────┘
```

## Contact Sync Sources

The scheduler can import contacts from multiple sources:

1. **Birthday DB** — SQLite database with name + platform columns
2. **Telegram** — recent chats from the Bot API
3. **Google People API** — Google Contacts (requires OAuth setup)
4. **Beeper** — contact list via Beeper Desktop API (optional `beepctl`)

Use the **Settings → Force Sync** button, or the per-platform **Rescan** buttons.

## Development

```bash
# Backend
uv venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn api:app --reload --port 9119

# Frontend
cd web && npm install && npm run dev

# Build
docker build -t message-scheduler:latest .
```

## Testing

```bash
pytest tests/ -v
```

## File Structure

```
scheduler/
├── api.py                  # FastAPI backend
├── Dockerfile              # Multi-stage build
├── docker-compose.yml      # Docker deployment
├── .env.example            # Configuration template
├── requirements.txt        # Python dependencies
├── web/                    # React frontend
│   └── src/
│       ├── App.tsx
│       └── components/
│           ├── ComposeTab.tsx
│           ├── QueueTab.tsx
│           ├── HistoryTab.tsx
│           ├── SettingsTab.tsx
│           └── ContactAutocomplete.tsx
└── tests/
    └── test_backend.py
```

## License

MIT
