# Hermes Message Scheduler Plugin

A plugin for Hermes Agent that allows you to schedule messages across various platforms (Beeper, Telegram, WhatsApp) using Hermes' internal cron system.

## Features
- Schedule messages to be sent at a specific time.
- Queue and History management.
- Dashboard UI for easy message composition.

## Installation
1. Clone this repository into your `~/.hermes/plugins/` directory:
   ```bash
   git clone https://github.com/SmoothMarx/Hermes-Message-Scheduler.git ~/.hermes/plugins/scheduled-messages
   ```
2. Restart your Hermes Agent to load the plugin.

## Development
- **Backend**: Python (FastAPI). See `api.py`.
- **Frontend**: React + Vite (located in the `web/` directory).

Check `plan.md` for architectural details and current progress.
