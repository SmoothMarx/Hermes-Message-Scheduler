# Message Scheduler — Hermes plugin

Schedule messages to go out later (Telegram, WhatsApp, Signal, iMessage, SMS, email,
Beeper-bridged networks), from the agent, from the dashboard, from the desktop app —
and have them actually leave the machine on time, with no model in the loop.

This directory is the **installable plugin package**. It is a self-contained half of
the Message Scheduler project: the Docker app in the repo root keeps working
untouched, and this directory can be installed on its own without dragging the
container stack along.

```
plugin/
├── plugin.yaml                 agent-plugin manifest (tools, config keys, env)
├── __init__.py                 register(ctx) — the only entry point Hermes calls
├── msgscheduler/               the shared core (imported by every surface below)
│   ├── config.py               settings resolution: env → settings.json → config.yaml → default
│   ├── core.py                 schema, queue, dispatch, contacts, media, bridge client
│   ├── schemas.py              agent-tool schemas (what the model sees)
│   └── tools.py                agent-tool handlers
├── dashboard/
│   ├── manifest.json           dashboard tab registration
│   ├── plugin_api.py           REST half, mounted at /api/plugins/message-scheduler/
│   └── dist/{index.js,style.css}  web tab — plain IIFE, no build step
├── desktop/plugin.js           desktop app page (ESM, @hermes/plugin-sdk)
├── scripts/dispatch_due.py     model-free dispatcher tick (cron)
├── scripts/adopt_container_db.py  migrate the old container's data in
├── skills/message-scheduler/   usage skill shipped with the plugin
├── tests/                      contracts for all four surfaces + run.sh + SDK drift check
└── install.sh                  install into $HERMES_HOME and verify it
```

## The four surfaces, one core

| Surface | Lands in | Contract |
|---|---|---|
| Agent tools | `plugin.yaml` + `__init__.py` | `register(ctx)`; gated by `plugins.enabled` |
| Dashboard REST | `dashboard/plugin_api.py` | module-level `router`, mounted at `/api/plugins/message-scheduler/` |
| Web tab | `dashboard/dist/index.js` | IIFE against `window.__HERMES_PLUGIN_SDK__`, no bundler |
| Desktop page | `desktop/plugin.js` | one ESM file, `@hermes/plugin-sdk` |
| Cadence | `scripts/dispatch_due.py` | cron; the only thing that sends on a schedule |

All four import `msgscheduler/core.py`, so scheduling logic exists once. The plugin
directory name is load-bearing: **it must be `message-scheduler`** — it keys the
toolset, the REST mount point and the dashboard directory.

## Install

```bash
./plugin/install.sh --dry-run            # show what would happen
./plugin/install.sh                      # install into $HERMES_HOME (default ~/.hermes)
./plugin/install.sh --hermes-home /path/.hermes
```

The installer copies the package to `$HERMES_HOME/plugins/message-scheduler/`,
backs up any previous install, then *verifies* it: the agent entry imports and
registers its tools, the REST module mounts (imported by path, the way the backend
does it), the bundle is a real IIFE, and the dispatcher tick runs dry. It exits
non-zero if any of that fails.

Then:

1. add `message-scheduler` to `plugins.enabled` in `$HERMES_HOME/config.yaml` and restart Hermes (agent tools);
2. restart the web server so the REST half mounts (dashboard tab);
3. reload the desktop app (sidebar → Messages; the desktop half is opt-in in Settings → Plugins);
4. add the cadence cron entries — see below.

## Cadence (this is what makes "scheduled" true)

Nothing in the plugin runs on a timer by itself. The dispatcher is a plain script
that makes **no model calls** and costs nothing to run:

```cron
* * * * *  $HERMES_HOME/plugins/message-scheduler/scripts/dispatch_due.py --quiet >> $HERMES_HOME/logs/message-scheduler.log 2>&1
0 * * * *  $HERMES_HOME/plugins/message-scheduler/scripts/dispatch_due.py --sweep-media --quiet >> $HERMES_HOME/logs/message-scheduler.log 2>&1
```

`--quiet` prints nothing when there is nothing to do (an idle queue adds no cron
noise). Exit code `2` means the dispatcher itself could not run — the one case cron
should shout about; an individual send failure is recorded in history instead.

Useful flags: `--dry-run` (list what is due, send nothing), `--limit N`,
`--sweep-media` (delete attachments past their retention window).

Past-due behaviour: a message more than `grace_seconds` late **that was also created
before that window** is recorded as `missed` rather than sent late — the machine was
down, and a message from three hours ago arriving now is worse than not arriving.
A message created moments ago but backdated on purpose is sent.

## Data

Default location: **`$HERMES_HOME/plugin-data/message-scheduler/`** — deliberately
*outside* the plugin directory, so reinstalling or updating the plugin can never wipe
the queue, contacts or history.

```
scheduler.db   SQLite: messages, history, contacts, templates, settings
media/         uploaded attachments
settings.json  optional overrides (written by the UI/operator)
```

Overrides, in resolution order (later wins): built-in default → `settings.json` →
`plugins.entries.message-scheduler.settings` in `config.yaml` → environment
(`MESSAGE_SCHEDULER_DATA_DIR`, `MESSAGE_SCHEDULER_DB`, `MESSAGE_SCHEDULER_MEDIA`,
`HERMES_BRIDGE_URL`, `HERMES_BRIDGE_TIMEOUT`).

Secrets never live here. The Telegram token belongs to the host bridge
(`~/.hermes/scripts/.env`, read by `hermes_bridge.py`); the plugin only knows the
bridge URL.

### Adopting the old container's data

```bash
python3 plugin/scripts/adopt_container_db.py --source-volume <docker-volume> --dry-run
python3 plugin/scripts/adopt_container_db.py --source-volume <docker-volume>
```

It copies the DB out read-only, verifies it opens, backs up whatever is already
installed, and reports the counts it found (contacts, queue, history) before and
after. `--dry-run` touches nothing.

## Testing

```bash
./plugin/tests/run.sh
```

Four checks, all runnable without the desktop app or a dashboard running:

| Check | What it pins |
|---|---|
| `pytest plugin/tests` | queue/dispatch/media/config behaviour; REST routes mounted the way the backend mounts them; cross-surface contracts (ids, tool list, config keys, folder name) |
| `node --test tests/desktop_plugin.test.mjs` | the desktop page registers a route/nav/chip and renders ready/loading/error states; cancelling calls `DELETE /jobs/<id>` |
| `node --test tests/dashboard_bundle.test.mjs` | the shipped bundle registers, stays inside its own API namespace, renders ready/error states |
| `tests/check_sdk_exports.py` | every `@hermes/plugin-sdk` name the desktop half imports still exists in the installed app (catches SDK drift) |

The JS halves are exercised with the SDK stubbed and React replaced by a ~40-line
mini-renderer, which is what makes "the page renders the ready state" a test rather
than a hope. Python tests never touch the network: the bridge is a fake injected at
one seam (`core._bridge_transport`).

## Troubleshooting

| Symptom | Cause |
|---|---|
| Tab missing after install | web server not restarted, or the plugin dir is not named `message-scheduler` |
| "Backend not reachable" in the tab/page | REST half not mounted — check the dashboard log for `message-scheduler` import errors |
| Desktop page absent | the desktop half is opt-in: Settings → Plugins |
| Messages never send | no cron entry for `dispatch_due.py` (nothing else sends on a schedule) |
| Sends fail with connection errors | host bridge not running on `$HERMES_BRIDGE_URL` (default `127.0.0.1:9190`) |
| A message is missing entirely | check history: `missed` means the grace window decided *not* to send it late |
