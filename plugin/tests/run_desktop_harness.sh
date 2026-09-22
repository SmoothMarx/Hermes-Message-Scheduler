#!/usr/bin/env bash
# Run the plugin's desktop half through the DESKTOP APP'S OWN loader.
#
# This is the only check that exercises the real thing end to end: the app's
# runtime loader (import allow-list, blob import, register(createPluginContext)),
# the real SDK shim, the real contribution registry and real React. Everything
# else about the desktop half can be checked with stubs; this cannot.
#
#   ./plugin/tests/run_desktop_harness.sh              # the plugin in this repo
#   MS_DESKTOP_PLUGIN_JS=... ./plugin/tests/run_desktop_harness.sh
#
# Requires the desktop app's sources WITH node_modules (a release install ships a
# pruned tree — run `npm ci` in the repo root once, or point HERMES_AGENT_DIR at a
# checkout that has it). Exits 2 (skip, not failure) when the app is unavailable.
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
AGENT_DIR="${HERMES_AGENT_DIR:-$HOME/.hermes/hermes-agent}"
DESKTOP="$AGENT_DIR/apps/desktop"
PROBE_SRC="$PLUGIN_DIR/tests/hermes_desktop/plugin_load.test.tsx"
PROBE_DEST="$DESKTOP/src/contrib/ms-hermes-plugin-harness.test.tsx"
PLUGIN_JS="${MS_DESKTOP_PLUGIN_JS:-$PLUGIN_DIR/desktop/plugin.js}"

if [ ! -f "$PROBE_SRC" ]; then
  echo "SKIP: harness source missing at $PROBE_SRC" >&2
  exit 2
fi
if [ ! -d "$DESKTOP/src/contrib" ]; then
  echo "SKIP: desktop app sources not found at $DESKTOP" >&2
  echo "      set HERMES_AGENT_DIR to a Hermes checkout." >&2
  exit 2
fi
if [ ! -d "$DESKTOP/node_modules" ] && [ ! -d "$AGENT_DIR/node_modules/vitest" ]; then
  echo "SKIP: the app's node_modules is missing (release install) — run 'npm ci' in $AGENT_DIR" >&2
  exit 2
fi
if [ ! -f "$PLUGIN_JS" ]; then
  echo "SKIP: no desktop/plugin.js at $PLUGIN_JS" >&2
  exit 2
fi

cleanup() { rm -f "$PROBE_DEST"; }
trap cleanup EXIT INT TERM

cp "$PROBE_SRC" "$PROBE_DEST"
echo "harness: $PLUGIN_JS"
echo "running: npx vitest run --project ui src/contrib/ms-hermes-plugin-harness.test.tsx"
cd "$DESKTOP"
MS_DESKTOP_PLUGIN_JS="$PLUGIN_JS" npx vitest run --project ui \
  src/contrib/ms-hermes-plugin-harness.test.tsx
