"""Cross-surface contracts — the things that break silently at install time.

The plugin id keys four things at once (folder name, agent toolset, REST mount
point, dashboard directory). A rename, a drifted config key or a stray ESM import in
the no-build dashboard bundle fails here, not as a blank tab in the app.
"""

from __future__ import annotations

import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path

import pytest

PLUGIN_DIR = Path(__file__).resolve().parents[1]
# In the repo the package lives in `plugin/`; the *installed* folder must be named
# after the plugin id. The manifests are the source of truth for the id, and
# install.sh is what has to land it under that name — both are checked below.
PLUGIN_DIR_NAME = PLUGIN_DIR.name
INSTALL_SH = PLUGIN_DIR / "install.sh"

if str(PLUGIN_DIR) not in sys.path:
    sys.path.insert(0, str(PLUGIN_DIR))

from msgscheduler import config, schemas  # noqa: E402  (after the bootstrap)
from msgscheduler import core  # noqa: E402


def _load_entry_module(module_name: str = "hermes_plugin_message-scheduler"):
    """Load plugin/__init__.py the way Hermes' plugin loader does."""
    spec = importlib.util.spec_from_file_location(
        module_name, PLUGIN_DIR / "__init__.py",
        submodule_search_locations=[str(PLUGIN_DIR)],
    )
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)
    return module


def _manifest_yaml() -> dict:
    """Parse plugin.yaml with a tiny reader (no yaml dependency in the plugin).

    Indent-aware on purpose: a flat reader mistakes the nested `description:`
    under an env entry for an env var of its own.
    """
    text = (PLUGIN_DIR / "plugin.yaml").read_text()
    data: dict = {"provides_tools": [], "config_schema": {}, "env": {}, "optional_env": {}, "requires_env": {}}
    section = None
    child_indent = None
    for raw in text.splitlines():
        if not raw.strip() or raw.lstrip().startswith("#"):
            continue
        indent = len(raw) - len(raw.lstrip())
        line = raw.strip()
        if indent == 0 and ":" in line and not line.startswith("- "):
            key, _, value = line.partition(":")
            if value.strip():
                data[key.strip()] = value.strip().strip('"')
                section, child_indent = None, None
            else:
                section, child_indent = key.strip(), None
            continue
        if section == "provides_tools" and line.startswith("- "):
            data["provides_tools"].append(line[2:].strip())
            continue
        if section in ("config_schema", "env", "optional_env", "requires_env") and ":" in line:
            if child_indent is None:
                child_indent = indent
            if indent == child_indent:
                if line.startswith("- name:"):
                    # list form: ``- name: HERMES_BRIDGE_URL`` → the env var NAME
                    data[section][line.split(":", 1)[1].strip().strip('"')] = True
                elif not line.startswith("- "):
                    # mapping form: ``KEY:`` under the section
                    data[section][line.split(":", 1)[0].strip()] = True
    return data


def _plugin_id() -> str:
    """The id every surface keys off — read from the plugin manifest."""
    return _manifest_yaml()["name"]


def test_the_id_is_consistent_across_every_surface_and_install_sh():
    plugin_id = _plugin_id()
    schema = _manifest_yaml()
    manifest = json.loads((PLUGIN_DIR / "dashboard" / "manifest.json").read_text())

    assert plugin_id == "message-scheduler", "the plugin id is load-bearing"
    assert schema["name"] == plugin_id
    assert manifest["name"] == plugin_id
    assert f"/{plugin_id}" == manifest["tab"]["path"]

    # The installed folder must carry that exact name, so install.sh has to land
    # it there — a dev tree under plugin/ would otherwise install as 'plugin'.
    install = (PLUGIN_DIR / "install.sh").read_text()
    assert f'PLUGIN_ID="{plugin_id}"' in install, "install.sh must set the id explicitly"
    assert 'plugins/${PLUGIN_ID}' in install, "install.sh must target $HERMES_HOME/plugins/<id>"


def test_every_declared_file_exists():
    manifest = json.loads((PLUGIN_DIR / "dashboard" / "manifest.json").read_text())
    for relative in [manifest["entry"], manifest["css"], manifest["api"]]:
        assert (PLUGIN_DIR / "dashboard" / relative).is_file(), relative
    assert (PLUGIN_DIR / "desktop" / "plugin.js").is_file()
    assert (PLUGIN_DIR / "scripts" / "dispatch_due.py").is_file()
    assert (PLUGIN_DIR / "skills" / _plugin_id() / "SKILL.md").is_file()


def test_provides_tools_matches_the_code_in_both_directions():
    declared = set(_manifest_yaml()["provides_tools"])
    implemented = set(schemas.ALL_SCHEMAS)

    assert declared == implemented, (
        f"plugin.yaml and schemas.py disagree: "
        f"declared-only={declared - implemented} code-only={implemented - declared}"
    )
    for name, schema in schemas.ALL_SCHEMAS.items():
        assert schema.get("description"), f"{name} has no description for the model"
        assert schema.get("parameters", {}).get("type") == "object"


def test_config_schema_matches_the_keys_the_code_reads():
    declared = set(_manifest_yaml()["config_schema"])
    assert declared == set(config.CTX_KEYS), (
        "plugin.yaml documents keys the code does not read (or vice versa): "
        f"yaml-only={declared - set(config.CTX_KEYS)} "
        f"code-only={set(config.CTX_KEYS) - declared}"
    )


def test_declared_env_vars_are_the_ones_the_code_honours():
    manifest = _manifest_yaml()
    declared = set(manifest["env"]) | set(manifest["optional_env"])
    honoured = set(config.ENV_OVERRIDES.values())
    assert declared <= honoured, f"documented but ignored: {declared - honoured}"
    # Anything the code honours should be documented too, so a user can find it.
    assert honoured <= declared, f"honoured but undocumented: {honoured - declared}"


def test_manifest_only_uses_fields_this_hermes_understands():
    """Unknown top-level fields are ignored with a warning on EVERY plugin load.

    Read the host's own allow-list rather than a copy of it, so the check follows
    the installed Hermes instead of drifting from it.
    """
    manifest_source = _find_hermes_manifest_module()
    if manifest_source is None:
        pytest.skip("Hermes sources not present on this machine")
    assert manifest_source is not None
    known = _parse_known_manifest_fields(manifest_source)
    if not known:
        pytest.fail("could not parse _KNOWN_MANIFEST_FIELDS — the guard would be blind")

    ours = set(_top_level_yaml_keys((PLUGIN_DIR / "plugin.yaml").read_text()))
    unknown = sorted(ours - known)
    assert not unknown, f"plugin.yaml would trigger 'unknown manifest field(s)' warnings: {unknown}"


def _find_hermes_manifest_module() -> Path | None:
    for candidate in (
        Path.home() / ".hermes" / "hermes-agent" / "hermes_cli" / "plugins_manifest.py",
        Path("/home/smoothmarx/.hermes/hermes-agent/hermes_cli/plugins_manifest.py"),
    ):
        if candidate.is_file():
            return candidate
    return None


def _parse_known_manifest_fields(path: Path) -> set[str]:
    text = path.read_text()
    match = re.search(r"_KNOWN_MANIFEST_FIELDS[^=]*=\s*\{(.*?)\}", text, re.S)
    if not match:
        return set()
    return set(re.findall(r"\"([a-z_]+)\"", match.group(1)))


def _top_level_yaml_keys(text: str) -> list[str]:
    return [
        line.split(":")[0].strip()
        for line in text.splitlines()
        if line and not line[0].isspace() and not line.startswith("#") and ":" in line
    ]


def test_register_wires_every_tool_and_the_skill(tmp_path, monkeypatch):
    monkeypatch.setenv("MESSAGE_SCHEDULER_DATA_DIR", str(tmp_path / "data"))
    module = _load_entry_module()
    calls: list[dict] = []
    skills: list[tuple] = []

    class FakeCtx:
        """Mirrors the real ctx signatures — a wrong call shape must fail here.

        The host's ``register_skill(name, path, description, frontmatter)`` reads the
        file itself; handing it markdown text raises inside the host and the skill
        silently never registers (observed as a warning, not an error).
        """

        def register_tool(self, **kwargs):
            calls.append(kwargs)

        def register_skill(self, name, path, description="", frontmatter=None):
            if not hasattr(path, "exists"):
                raise TypeError("register_skill expects a Path, not text")
            if not path.exists():
                raise FileNotFoundError(f"SKILL.md not found at {path}")
            skills.append((name, path, description))

    module.register(FakeCtx())

    registered = {c["name"] for c in calls}
    assert registered == set(schemas.ALL_SCHEMAS)
    assert all(c["toolset"] == _plugin_id() for c in calls)
    for call in calls:
        assert callable(call["handler"]), call["name"]
        assert call["schema"]["description"]
    assert [s[0] for s in skills] == [_plugin_id()]
    assert skills[0][1].name == "SKILL.md" and skills[0][1].is_file()
    assert skills[0][2], "the host shows this description; it must not be empty"


def test_register_survives_a_ctx_without_skill_support(tmp_path, monkeypatch):
    monkeypatch.setenv("MESSAGE_SCHEDULER_DATA_DIR", str(tmp_path / "data"))
    module = _load_entry_module("hermes_plugin_message-scheduler-noskill")
    calls = []

    class OldCtx:
        def register_tool(self, **kwargs):
            calls.append(kwargs)

    module.register(OldCtx())  # must not raise
    assert len(calls) == len(schemas.ALL_SCHEMAS)


def test_register_does_not_write_outside_the_plugin_data_dir(monkeypatch, tmp_path):
    """Registering must be side-effect free apart from registration."""
    monkeypatch.setenv("MESSAGE_SCHEDULER_DATA_DIR", str(tmp_path / "data"))
    module = _load_entry_module("hermes_plugin_message-scheduler-sideeffects")

    class FakeCtx:
        def register_tool(self, **kwargs):
            pass

        def register_skill(self, name, content):
            pass

    module.register(FakeCtx())

    created = {p.name for p in (tmp_path / "data").iterdir()} if (tmp_path / "data").exists() else set()
    assert created <= {"scheduler.db", "media"}, f"unexpected writes: {created}"


def test_the_dashboard_bundle_is_a_plain_iife_with_no_build_step():
    source = (PLUGIN_DIR / "dashboard" / "dist" / "index.js").read_text()
    for line in source.splitlines():
        stripped = line.strip()
        assert not stripped.startswith(("import ", "export ")), f"ESM in a no-build bundle: {line}"
        assert "require(" not in stripped, f"CommonJS in a no-build bundle: {line}"
    assert "__HERMES_PLUGINS__" in source and "register" in source


def test_the_desktop_plugin_only_imports_the_sdk_and_react():
    source = (PLUGIN_DIR / "desktop" / "plugin.js").read_text()
    allowed = {"@hermes/plugin-sdk", "react", "react/jsx-runtime"}
    # Import clauses may span lines, so match over the whole source, not per line.
    specifiers = re.findall(r"^import\s+(?:[^'\"]*?from\s+)?['\"]([^'\"]+)['\"]", source, re.M)
    assert specifiers, "expected the desktop plugin to import the SDK"
    for specifier in specifiers:
        assert specifier in allowed, f"desktop plugins may not import {specifier}"
    assert "@hermes/plugin-sdk" in specifiers


def test_the_dispatcher_tick_runs_headless_and_reports_json(tmp_path):
    """The model-free half: no Hermes, no network, still drains the queue."""
    data_dir = tmp_path / "data"
    result = subprocess.run(
        [sys.executable, str(PLUGIN_DIR / "scripts" / "dispatch_due.py"), "--dry-run"],
        capture_output=True, text=True,
        env={"PATH": "/usr/bin:/bin", "MESSAGE_SCHEDULER_DATA_DIR": str(data_dir),
             "PYTHONPATH": ""},
        timeout=60,
    )
    assert result.returncode == 0, result.stderr
    report = json.loads(result.stdout)
    assert report["dry_run"] is True
    assert report["scanned"] == 0
    assert (data_dir / "scheduler.db").is_file()


def test_quiet_prints_nothing_when_there_is_nothing_to_do(tmp_path):
    result = subprocess.run(
        [sys.executable, str(PLUGIN_DIR / "scripts" / "dispatch_due.py"), "--quiet", "--dry-run"],
        capture_output=True, text=True,
        env={"PATH": "/usr/bin:/bin",
             "MESSAGE_SCHEDULER_DATA_DIR": str(tmp_path / "data"), "PYTHONPATH": ""},
        timeout=60,
    )
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "", "a quiet empty tick must not fill the cron log"


def test_the_dispatcher_refuses_to_send_on_a_dry_run(tmp_path, monkeypatch):
    from msgscheduler.config import load_settings

    data_dir = tmp_path / "data"
    monkeypatch.setenv("MESSAGE_SCHEDULER_DATA_DIR", str(data_dir))

    settings = load_settings()
    core.send_now("Ana", "telegram", "must not leave", settings=settings)

    result = subprocess.run(
        [sys.executable, str(PLUGIN_DIR / "scripts" / "dispatch_due.py"), "--dry-run"],
        capture_output=True, text=True,
        env={"PATH": "/usr/bin:/bin", "MESSAGE_SCHEDULER_DATA_DIR": str(data_dir),
             "PYTHONPATH": ""},
        timeout=60,
    )
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["sent"], "dry run should list what it would send"

    fresh = load_settings()
    assert len(core.list_jobs(fresh)) == 1, "dry run must leave the queue untouched"


@pytest.mark.skipif(
    not (Path.home() / ".hermes" / "hermes-agent").exists(),
    reason="Hermes app sources not present on this machine",
)
def test_skill_frontmatter_is_valid():
    text = (PLUGIN_DIR / "skills" / _plugin_id() / "SKILL.md").read_text()
    assert text.startswith("---\n"), "SKILL.md needs YAML frontmatter"
    front, _, body = text[4:].partition("\n---")
    assert "name: " in front and "description: " in front
    assert len(body.strip()) > 200


# --------------------------------------------------------------------------- #
# Port parity: the REST half must not silently drop the app's public surface.
# --------------------------------------------------------------------------- #

# Paths the plugin deliberately does NOT carry, with the reason. Anything missing
# from the plugin that is not listed here fails the test below.
_DROPPED_ON_PURPOSE = {
    ("GET", "/contacts/sync-pending"):
        "dead stub in api.py — returns a constant {pending: False} ('no longer needed')",
}


def _routes_from(path):
    """Route (method, shape) pairs from a FastAPI/Flask module's decorators.

    Path parameters are collapsed, so ``/contacts/sync/{net}`` and
    ``/contacts/sync/{network}`` are recognised as the same route.
    """
    text = path.read_text()
    found = set()
    for match in re.finditer(r"@(?:app|router)\.(get|post|put|delete|patch)\(\s*[\"']([^\"']+)[\"']", text):
        shape = re.sub(r"\{[^}]+\}", "{}", match.group(2))
        if shape.startswith("/api/"):
            shape = shape[len("/api"):]
        found.add((match.group(1).upper(), shape))
    return found


def test_the_rest_half_keeps_every_public_route_of_the_original_app():
    """The plugin is a PORT: a path the app served must not vanish.

    Skips when the sibling app is not present (an installed copy has no api.py).
    """
    app_api = PLUGIN_DIR.parent / "api.py"
    if not app_api.is_file():
        pytest.skip("standalone app not present beside the plugin (installed copy)")
    app_routes = _routes_from(app_api)
    plugin_routes = _routes_from(PLUGIN_DIR / "dashboard" / "plugin_api.py")
    assert len(app_routes) > 20, f"parser found only {len(app_routes)} app routes — the guard would be blind"
    assert len(plugin_routes) > 20, f"parser found only {len(plugin_routes)} plugin routes"

    dropped = sorted(app_routes - plugin_routes)
    assert dropped == sorted(_DROPPED_ON_PURPOSE), (
        "the REST half no longer serves routes the app served, or the on-purpose "
        f"list is stale: {dropped}"
    )
