#!/usr/bin/env bash
# Install the Message Scheduler plugin into a Hermes home.
#
#   ./plugin/install.sh                 # install into ~/.hermes (or $HERMES_HOME)
#   ./plugin/install.sh --dry-run       # show what would happen
#   ./plugin/install.sh --hermes-home /path/to/.hermes
#   ./plugin/install.sh --keep-data     # do not touch an existing install's data/
#
# The plugin id is load-bearing: it keys the agent toolset, the REST mount point
# (/api/plugins/message-scheduler/) and the dashboard directory. The installed
# folder is therefore always <hermes-home>/plugins/message-scheduler, whatever the
# directory is called in this repo.
set -euo pipefail

PLUGIN_ID="message-scheduler"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HERMES_HOME="${HERMES_HOME:-$HOME/.hermes}"
DRY_RUN=0
KEEP_DATA=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=1; shift ;;
    --keep-data) KEEP_DATA=1; shift ;;
    --hermes-home) HERMES_HOME="${2:?--hermes-home needs a path}"; shift 2 ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "unknown option: $1" >&2; exit 64 ;;
  esac
done

DEST="${HERMES_HOME}/plugins/${PLUGIN_ID}"
BACKUP_DIR="${HERMES_HOME}/plugin-backups"
PY="${PY:-$(command -v python3)}"

say() { printf '  %s\n' "$*"; }
step() { printf '\n== %s ==\n' "$*"; }

step "Target"
say "source:       $HERE"
say "hermes home:  $HERMES_HOME"
say "install to:   $DEST"

if [[ ! -f "$HERE/plugin.yaml" ]]; then
  echo "error: $HERE does not look like the plugin (no plugin.yaml)" >&2
  exit 1
fi

if [[ $DRY_RUN -eq 1 ]]; then
  step "Dry run — nothing will be written"
  say "would copy plugin files to $DEST (excluding data/, __pycache__/, .pytest_cache/)"
  say "would back up an existing install to $BACKUP_DIR/${PLUGIN_ID}-<timestamp>"
  say "would then verify: agent entry, REST module, dashboard bundle, desktop page"
  exit 0
fi

mkdir -p "${HERMES_HOME}/plugins"

# Back up rather than overwrite: a previous install may hold live data.
if [[ -d "$DEST" ]]; then
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "$BACKUP_DIR"
  step "Backing up the existing install"
  cp -a "$DEST" "$BACKUP_DIR/${PLUGIN_ID}-${stamp}"
  say "saved to $BACKUP_DIR/${PLUGIN_ID}-${stamp}"
fi

step "Copying plugin files"
mkdir -p "$DEST"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete \
    --exclude 'data/' --exclude '__pycache__/' --exclude '.pytest_cache/' \
    --exclude '*.pyc' \
    "$HERE/" "$DEST/"
else
  tar -C "$HERE" \
    --exclude='data' --exclude='__pycache__' --exclude='.pytest_cache' --exclude='*.pyc' \
    -cf - . | tar -C "$DEST" -xf -
fi
say "copied $(find "$DEST" -type f | wc -l | tr -d ' ') files"

# The queue, contacts and history live OUTSIDE the plugin directory (default:
# $HERMES_HOME/plugin-data/message-scheduler), so reinstalling never touches them.
# Only warn if an older install left data inside the plugin dir.
if [[ -d "$DEST/data" ]]; then
  say "note: $DEST/data exists from an older install"
  if [[ $KEEP_DATA -eq 1 ]]; then
    say "      left in place (--keep-data)"
  else
    say "      left in place — the plugin now uses \$HERMES_HOME/plugin-data/${PLUGIN_ID}/"
    say "      move it with: cp -a $DEST/data/. \"$HERMES_HOME/plugin-data/${PLUGIN_ID}/\""
  fi
fi

step "Verifying the install"
fail=0
check() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then
    say "ok    $label"
  else
    say "FAIL  $label"
    fail=1
  fi
}

check "agent entry imports and registers" "$PY" - "$DEST" <<'PY'
import importlib.util, sys, pathlib
dest = pathlib.Path(sys.argv[1])
sys.path.insert(0, str(dest))
spec = importlib.util.spec_from_file_location("hermes_plugin_message-scheduler", dest / "__init__.py",
                                              submodule_search_locations=[str(dest)])
mod = importlib.util.module_from_spec(spec); sys.modules[spec.name] = mod
spec.loader.exec_module(mod)

class Ctx:
    def __init__(self): self.tools = []
    def register_tool(self, **kw): self.tools.append(kw["name"])
    def register_skill(self, *a, **k): pass

ctx = Ctx(); mod.register(ctx)
assert len(ctx.tools) >= 8, ctx.tools
PY

# The backend mounts plugin_api.py by PATH as a standalone module — import it that
# way, so a relative import would be caught here rather than at dashboard startup.
check "dashboard REST module mounts" "$PY" - "$DEST" <<'PY'
import importlib.util, sys, pathlib
dest = pathlib.Path(sys.argv[1])
path = dest / "dashboard" / "plugin_api.py"
spec = importlib.util.spec_from_file_location("hermes_dashboard_plugin_message-scheduler", path)
mod = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = mod
spec.loader.exec_module(mod)
assert hasattr(mod, "router"), "no module-level APIRouter"
routes = {r.path for r in mod.router.routes}
assert any("/summary" in r for r in routes), routes
PY

check "dashboard bundle is a plain IIFE" grep -q "__HERMES_PLUGINS__" "$DEST/dashboard/dist/index.js"
check "desktop page present" test -f "$DEST/desktop/plugin.js"
check "dispatcher tick runs" "$PY" "$DEST/scripts/dispatch_due.py" --dry-run

"$PY" - "$DEST" <<'PY' || true
import json, pathlib, sys
manifest = json.loads((pathlib.Path(sys.argv[1]) / "dashboard" / "manifest.json").read_text())
print(f"  plugin id:    {manifest['name']}")
print(f"  dashboard tab path: {manifest['tab']['path']}  (position: {manifest['tab']['position']})")
PY

step "Next steps"
cat <<EOF
  1. Agent tools:    add '${PLUGIN_ID}' to plugins.enabled in $HERMES_HOME/config.yaml, then restart Hermes.
  2. Dashboard tab:  restart the Hermes web server so the REST half mounts.
  3. Desktop page:   it appears after the app reloads (sidebar: Messages).
  4. Cadence (this is what actually sends scheduled messages):
       * * * * *  $DEST/scripts/dispatch_due.py --quiet >> $HERMES_HOME/logs/${PLUGIN_ID}.log 2>&1
     0 * * * *    $DEST/scripts/dispatch_due.py --sweep-media --quiet >> $HERMES_HOME/logs/${PLUGIN_ID}.log 2>&1
  5. Where the data lives: $HERMES_HOME/plugin-data/${PLUGIN_ID}/
     (scheduler.db, media/, settings.json — outside the plugin dir, so reinstalling
     never wipes the queue, contacts or history)
  6. Adopting data from the old container:
       $PY $DEST/scripts/adopt_container_db.py --source-volume <volume> --dry-run
EOF

if [[ $fail -ne 0 ]]; then
  echo
  echo "INSTALL COMPLETED WITH FAILURES — see the FAIL lines above" >&2
  exit 1
fi
echo
echo "Installed: $DEST"
