#!/usr/bin/env python3
"""Check the desktop plugin's SDK imports against the installed Hermes app.

The desktop app is a moving target: a name the plugin imports can disappear from
`@hermes/plugin-sdk` between releases, and the failure only shows up as a blank
pane (or a load-error toast) at runtime. This compares the plugin's import list
against the SDK surface the app actually ships.

    python3 plugin/tests/check_sdk_exports.py [--app-dir PATH]

Exit codes: 0 = every imported name exists, 1 = drift (prints the names), 2 =
could not find the app (skip, not a failure).
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PLUGIN_DIR = HERE.parent
DESKTOP_PLUGIN = PLUGIN_DIR / "desktop" / "plugin.js"

DEFAULT_APP_CANDIDATES = (
    Path.home() / ".hermes" / "hermes-agent" / "apps" / "desktop" / "src",
    Path.home() / ".hermes" / "hermes-agent" / "apps" / "desktop",
)

IMPORT_RE = re.compile(
    r"^import\s+(?P<what>[\s\S]*?)\s+from\s+['\"](?P<from>[^'\"]+)['\"]",
    re.M,
)


def imported_names() -> dict[str, set[str]]:
    """What desktop/plugin.js imports, per module."""
    source = DESKTOP_PLUGIN.read_text()
    per_module: dict[str, set[str]] = {}
    for match in IMPORT_RE.finditer(source):
        specifier = match.group("from")
        clause = match.group("what").strip()
        names: set[str] = set()
        if clause.startswith("{"):
            for part in clause.strip("{} \n").split(","):
                part = part.strip()
                if not part:
                    continue
                names.add(part.split(" as ")[-1].strip())
        else:
            names.add(clause.split(",")[0].strip())  # default import
        per_module.setdefault(specifier, set()).update(names)
    return per_module


def app_sdk_surface(app_src: Path) -> set[str]:
    """Every name the app's plugin SDK re-exports."""
    exports: set[str] = set()
    index = app_src / "sdk" / "index.ts"
    files = list((app_src / "sdk").rglob("*.ts")) if (app_src / "sdk").is_dir() else []
    targets = [index] if index.is_file() else []
    for path in files:
        text = path.read_text()
        for match in re.finditer(r"export\s*\{([^}]*)\}", text):
            for part in match.group(1).split(","):
                part = part.strip()
                if not part:
                    continue
                name = part.split(" as ")[-1].strip()
                if name and name != "type":
                    exports.add(name)
        for match in re.finditer(r"export\s+(?:declare\s+)?(?:const|function|class|type|interface)\s+(\w+)", text):
            exports.add(match.group(1))
        # a re-export barrel: export * from './x'
        if path in targets:
            for match in re.finditer(r"export\s+\*\s+from\s+['\"]([^'\"]+)['\"]", text):
                ref = match.group(1)
                candidate = (path.parent / ref).resolve()
                for suffix in (".ts", ".tsx", "/index.ts", ""):
                    probe = Path(str(candidate) + suffix)
                    if probe.is_file():
                        sub = probe.read_text()
                        for sub_match in re.finditer(r"export\s*\{([^}]*)\}", sub):
                            for part in sub_match.group(1).split(","):
                                name = part.strip().split(" as ")[-1].strip()
                                if name and name != "type":
                                    exports.add(name)
                        break
    return exports


def find_app_dir(explicit: str | None) -> Path | None:
    if explicit:
        path = Path(explicit).expanduser()
        return path if path.exists() else None
    for candidate in DEFAULT_APP_CANDIDATES:
        if (candidate / "sdk").is_dir():
            return candidate
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--app-dir", help="the app's apps/desktop/src directory")
    args = parser.parse_args()

    app = find_app_dir(args.app_dir)
    if app is None:
        print("SKIP: Hermes desktop sources not found (pass --app-dir)")
        return 2

    surface = app_sdk_surface(app)
    if not surface:
        print(f"SKIP: no exports found under {app}")
        return 2

    problems: list[str] = []
    for specifier, names in sorted(imported_names().items()):
        if specifier != "@hermes/plugin-sdk":
            continue  # react etc. are not the app's concern
        for name in sorted(names):
            if name not in surface:
                problems.append(name)

    if problems:
        print(f"DRIFT: {len(problems)} name(s) missing from {app}/sdk:")
        for name in problems:
            print(f"  - {name}")
        return 1

    checked = sum(len(n) for s, n in imported_names().items() if s == "@hermes/plugin-sdk")
    if checked == 0:
        print("FAIL: found no @hermes/plugin-sdk imports to check — the parser is blind")
        return 1
    print(f"OK: all {checked} SDK imports exist in {app} ({len(surface)} names checked)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
