---
name: message-scheduler
description: "Use when scheduling, cancelling, or reviewing messages sent later on Telegram/WhatsApp/Signal/email/Beeper — the Message Scheduler plugin's tools and its dispatcher."
version: 1.0.0
author: SmoothMarx
license: MIT
platforms: [linux, macos]
metadata:
  hermes:
    tags: [messaging, scheduling, telegram, whatsapp, reminders]
    category: communication
    related_skills: [email-inbox-triage]
---

# Message Scheduler

Schedule a message now, have it sent later — to a real person, on a real platform.
The message is written to a queue; a dispatcher sends it when it comes due. Nothing
is sent by the act of scheduling.

## Tools

| Tool | Use it for |
|---|---|
| `messages_find_contact` | Resolve a name to the platform ids on file **before** scheduling to someone you are unsure about |
| `messages_schedule` | Queue a message for a future time |
| `messages_send_now` | Send immediately (queued as due now; goes out on the next dispatcher tick) |
| `messages_list` | See what is still queued, with ids |
| `messages_cancel` | Kill a queued message before it goes |
| `messages_history` | What was sent / failed / missed, with the failure reason |
| `messages_dispatch` | Run the dispatcher now (or `dry_run` to preview) |
| `messages_status` | Queue depth, next send, sent/failed counts, whether the send bridge is reachable |

## Rules that matter

- **Scheduling ≠ sending.** Only `messages_send_now` (and time passing) results in a
  message leaving. Say "queued", not "sent".
- **Recipient resolution:** pass a name from the address book (the scheduler looks up
  that person's identifier for the network) or a raw platform id (chat id, `@handle`,
  phone, Beeper chat id). If a name exists on several networks, name the network
  explicitly rather than assuming.
- **Times are UTC unless you give an offset.** `2026-09-23T09:30:00` means 09:30 UTC;
  write `2026-09-23T09:30:00+01:00` (or the zone's offset) for local intent. Quote the
  time back to the user in plain language, including which zone you meant.
- **Attachments:** pass file paths; they are copied into the scheduler's media dir and
  cleaned up after a dispatch. Files older than the retention window (30 days by
  default) are swept.
- **A queued message is not a reminder for the agent.** The dispatcher sends it whether
  or not a session is running; that is the point.
- **Failures are recorded, not retried.** A failed send lands in history with the
  bridge's error. Check `messages_history(failed_only=true)` before assuming delivery.

## Operating it

The dispatcher is a cron tick, not a background thread:

```bash
<hermes-home>/plugins/message-scheduler/scripts/dispatch_due.py --quiet
```

Run it every minute. Without that tick, scheduled messages sit in the queue and only
move when someone calls `messages_dispatch` or opens the UI. If sends are landing as
`missed`, the tick is not running (a message is `missed` when it came due more than
the grace window — 5 minutes — before the dispatcher noticed, and had been created
before that window too).

Sends go out through the **host bridge** (`hermes_bridge.py`, default
`http://127.0.0.1:9190`), which owns the platform credentials. If
`messages_status` says the bridge is unreachable, the queue still accepts work and
every send will fail until it is back — say so rather than silently reporting success.

## Surfaces

- Agent tools (above) — this session.
- Web dashboard: **Messages** tab (queue, compose, history, notify settings).
- Desktop app: **Messages** page + statusbar queue chip (opt-in: Settings → Plugins).
- REST: `/api/plugins/message-scheduler/*` on the dashboard backend.

Config lives under `plugins.entries.message-scheduler.settings` in `config.yaml`
(bridge URL, grace window, limits, timezone). The database and media live in the
plugin's `data/` directory unless `MESSAGE_SCHEDULER_DB` overrides it.
