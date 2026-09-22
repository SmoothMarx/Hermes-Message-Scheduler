"""REST-half contracts, exercised the way Hermes actually loads the file.

The backend mounts ``dashboard/plugin_api.py`` by PATH as a standalone module named
``hermes_dashboard_plugin_<id>`` (no package context) — these tests import it the same
way, so a relative import or a module-level side effect that only works under pytest
is caught here instead of in ``errors.log`` at dashboard startup.
"""

from __future__ import annotations

import importlib.util
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

PLUGIN_DIR = Path(__file__).resolve().parents[1]
API_PATH = PLUGIN_DIR / "dashboard" / "plugin_api.py"
PREFIX = "/api/plugins/message-scheduler"


@pytest.fixture
def client(tmp_path, monkeypatch):
    """A temp data dir + the plugin mounted under its real URL prefix."""
    monkeypatch.setenv("MESSAGE_SCHEDULER_DATA_DIR", str(tmp_path / "data"))
    module_name = "hermes_dashboard_plugin_message-scheduler"
    spec = importlib.util.spec_from_file_location(module_name, API_PATH)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    spec.loader.exec_module(module)

    app = FastAPI()
    app.include_router(module.router, prefix=PREFIX)
    return TestClient(app)


def test_router_mounts_and_reports_summary(client):
    response = client.get(f"{PREFIX}/summary")
    assert response.status_code == 200
    body = response.json()
    assert body["queued"] == 0
    assert body["db_path"].endswith("scheduler.db")


def test_schedule_list_and_cancel_a_job(client):
    created = client.post(f"{PREFIX}/jobs", json={
        "person": "Ana", "network": "telegram",
        "when": "2030-01-01T09:00:00+00:00", "text": "hello",
    })
    assert created.status_code == 200
    job_id = created.json()["id"]

    listed = client.get(f"{PREFIX}/jobs").json()
    assert [j["id"] for j in listed["jobs"]] == [job_id]
    assert listed["jobs"][0]["time"].startswith("2030-01-01T09:00:00")

    assert client.delete(f"{PREFIX}/jobs/{job_id}").json()["status"] == "cancelled"
    assert client.get(f"{PREFIX}/jobs").json()["count"] == 0
    assert client.delete(f"{PREFIX}/jobs/{job_id}").status_code == 404


def test_bad_timestamp_is_a_400_not_a_500(client):
    response = client.post(f"{PREFIX}/jobs", json={
        "person": "Ana", "network": "telegram", "when": "sometime tuesday", "text": "hi",
    })
    assert response.status_code == 400
    assert "timestamp" in response.json()["detail"]


def test_unknown_attachment_is_rejected(client):
    response = client.post(f"{PREFIX}/jobs", json={
        "person": "Ana", "network": "telegram", "when": "2030-01-01T09:00:00Z",
        "text": "hi", "attachments": ["/media/not-there.png"],
    })
    assert response.status_code == 400
    assert "unknown attachment" in response.json()["detail"]


def test_upload_then_serve_media(client):
    uploaded = client.post(f"{PREFIX}/upload", files={"file": ("note.txt", b"hello", "text/plain")})
    assert uploaded.status_code == 200
    body = uploaded.json()
    assert body["url"].startswith(f"{PREFIX}/media/")

    served = client.get(body["url"])
    assert served.status_code == 200
    assert served.content == b"hello"

    assert client.get(f"{PREFIX}/media/../scheduler.db").status_code == 404
    assert client.get(f"{PREFIX}/media/missing.txt").status_code == 404


def test_dispatch_route_reports_what_it_did(client, monkeypatch):
    from msgscheduler import core

    monkeypatch.setattr(core, "_bridge_transport",
                        lambda method, payload, settings: {"status": "sent"})
    client.post(f"{PREFIX}/send", json={"person": "Ana", "network": "telegram", "text": "now"})

    preview = client.post(f"{PREFIX}/dispatch?dry_run=true").json()
    assert preview["scanned"] == 1 and preview["sent"] and preview["dry_run"] is True

    live = client.post(f"{PREFIX}/dispatch").json()
    assert live["scanned"] == 1 and live["dry_run"] is False

    history = client.get(f"{PREFIX}/history").json()
    assert [h["status"] for h in history["history"]] == ["sent"]


def test_contacts_search_aggregates_platforms(client):
    client.post(f"{PREFIX}/contacts", json={"name": "Ana", "network": "telegram", "identifier": "1"})
    client.post(f"{PREFIX}/contacts", json={"name": "Ana", "network": "whatsapp", "identifier": "2"})

    people = client.get(f"{PREFIX}/contacts/search", params={"q": "an"}).json()["people"]
    assert len(people) == 1
    assert {n["network"] for n in people[0]["networks"]} == {"telegram", "whatsapp"}


def test_notify_settings_roundtrip(client):
    assert client.get(f"{PREFIX}/settings/notify").json()["channel"] == ""
    saved = client.post(f"{PREFIX}/settings/notify",
                        json={"channel": "telegram", "identifier": "999", "user_name": "Pedro"})
    assert saved.json()["status"] == "saved"
    assert client.get(f"{PREFIX}/settings/notify").json()["identifier"] == "999"


def test_outgoing_claim_and_result_contract(client, monkeypatch):
    from msgscheduler import core

    monkeypatch.setattr(core, "_bridge_transport",
                        lambda method, payload, settings: {"status": "sent"})
    client.post(f"{PREFIX}/send", json={"person": "Ana", "network": "telegram", "text": "now"})

    claimed = client.get(f"{PREFIX}/outgoing").json()["outgoing"]
    assert len(claimed) == 1
    job_id = claimed[0]["id"]

    recorded = client.post(f"{PREFIX}/outgoing/{job_id}/result",
                           json={"status": "sent", "error": ""})
    assert recorded.json()["status"] == "recorded"
    assert client.post(f"{PREFIX}/outgoing/{job_id}/result",
                       json={"status": "nonsense"}).status_code == 400
    assert client.get(f"{PREFIX}/outgoing").json()["outgoing"] == []


def test_config_route_exposes_paths_for_the_ui(client):
    body = client.get(f"{PREFIX}/config").json()
    assert body["mount"] == PREFIX
    assert body["db_path"].endswith("scheduler.db")
    assert body["bridge_url"].startswith("http")


def test_templates_crud(client):
    created = client.post(f"{PREFIX}/templates",
                          json={"name": "Birthday", "text": "Happy birthday!"})
    template_id = created.json()["id"]
    assert client.get(f"{PREFIX}/templates").json()["templates"][0]["name"] == "Birthday"
    assert client.delete(f"{PREFIX}/templates/{template_id}").json()["status"] == "deleted"
