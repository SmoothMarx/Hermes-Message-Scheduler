#!/usr/bin/env bash
# Run every check for the plugin: Python contracts, both JS halves, SDK drift.
#
#   ./tests/run.sh                 # from the repo, or from an installed copy
#   PY=/path/to/python ./tests/run.sh
#   NODE_BIN=/path/to/node ./tests/run.sh
#
# Interpreter discovery: $PY, then a neighbouring venv (repo checkout), then
# python3. If that interpreter lacks pytest/fastapi the Python half is reported as
# SKIP (with the install hint) instead of a false FAIL — an installed plugin needs
# no test dependencies to run.
set -uo pipefail

TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_DIR="$(dirname "$TESTS_DIR")"

find_node() {
  if [[ -n "${NODE_BIN:-}" ]]; then echo "$NODE_BIN"; return; fi
  if command -v node >/dev/null 2>&1; then command -v node; return; fi
  for candidate in /home/smoothmarx/.hermes/node/bin/node /usr/local/bin/node; do
    [[ -x "$candidate" ]] && { echo "$candidate"; return; }
  done
  echo ""
}

find_python() {
  if [[ -n "${PY:-}" ]]; then echo "$PY"; return; fi
  for candidate in "$PLUGIN_DIR/../.venv/bin/python" "$PLUGIN_DIR/.venv/bin/python" "$PWD/.venv/bin/python"; do
    [[ -x "$candidate" ]] && { echo "$candidate"; return; }
  done
  command -v python3 || echo ""
}

PY_EXE="$(find_python)"
NODE_EXE="$(find_node)"
status=0

run() {
  local label="$1"; shift
  echo
  echo "== $label =="
  if "$@"; then
    echo "-- $label: PASS"
  else
    echo "-- $label: FAIL"
    status=1
  fi
}

echo "python: ${PY_EXE:-none}"
echo "node:   ${NODE_EXE:-none}"

if [[ -z "$PY_EXE" ]]; then
  echo "-- python tests: SKIP (no interpreter)"
elif "$PY_EXE" -c 'import pytest, fastapi, httpx' >/dev/null 2>&1; then
  run "python tests" "$PY_EXE" -m pytest "$TESTS_DIR" -q -p no:cacheprovider
else
  echo
  echo "== python tests =="
  echo "-- python tests: SKIP ($PY_EXE lacks pytest/fastapi/httpx)"
  echo "   install with: $PY_EXE -m pip install pytest fastapi httpx"
fi

if [[ -z "$NODE_EXE" ]]; then
  echo
  echo "== js halves =="
  echo "-- js halves: SKIP (no node)"
else
  run "desktop plugin" "$NODE_EXE" --test "$TESTS_DIR/desktop_plugin.test.mjs"
  run "dashboard bundle" "$NODE_EXE" --test "$TESTS_DIR/dashboard_bundle.test.mjs"
fi

if [[ -n "$PY_EXE" ]]; then
  echo
  echo "== sdk export drift =="
  if "$PY_EXE" "$TESTS_DIR/check_sdk_exports.py"; then
    :
  else
    rc=$?
    if [[ $rc -eq 2 ]]; then
      echo "-- sdk export drift: SKIP (Hermes app not found on this machine)"
    else
      echo "-- sdk export drift: FAIL"
      status=1
    fi
  fi
fi

echo
echo "== desktop half through the app's real loader =="
# Opt out with MS_SKIP_DESKTOP_HARNESS=1 (it needs the app's node_modules, ~8s).
if [[ "${MS_SKIP_DESKTOP_HARNESS:-0}" == "1" ]]; then
  echo "-- desktop loader harness: SKIP (MS_SKIP_DESKTOP_HARNESS=1)"
elif harness_out="$("$TESTS_DIR/run_desktop_harness.sh" 2>&1)"; then
  echo "-- desktop loader harness: PASS"
else
  rc=$?
  if [[ $rc -eq 2 ]]; then
    echo "-- desktop loader harness: SKIP (desktop app or its node_modules unavailable)"
  else
    echo "-- desktop loader harness: FAIL"
    printf '%s\n' "$harness_out" | tail -20
    status=1
  fi
fi

echo
if [[ $status -eq 0 ]]; then
  echo "ALL CHECKS PASSED"
else
  echo "CHECKS FAILED"
fi
exit $status
