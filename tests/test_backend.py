import pytest
import sys
import os
from unittest.mock import patch
from fastapi.testclient import TestClient
import sqlite3

# Set test DB before importing api
import tempfile

# Use a temp file for testing (":memory:" creates a new DB per connection)
os.environ["MESSAGE_SCHEDULER_DB"] = tempfile.mktemp(suffix=".db")
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api import app, init_db

client = TestClient(app)

# Ensure DB is initialized for TestClient (startup events don't always fire)
init_db()


def cleanup():
    db_path = os.environ.get("MESSAGE_SCHEDULER_DB", "")
    if db_path and os.path.exists(db_path):
        os.remove(db_path)

def test_schedule_and_outgoing():
    """Schedule a message and verify it appears in outgoing."""
    payload = {
        "person": "Test User",
        "network": "telegram",
        "time": "2026-07-21T09:00:00Z",
        "text": "Hello from the scheduler!"
    }

    # Schedule
    resp = client.post("/api/schedule", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "scheduled"
    job_id = data["id"]

    # Jobs list
    resp = client.get("/api/jobs")
    assert resp.status_code == 200
    jobs = resp.json()["jobs"]
    assert len(jobs) == 1
    assert jobs[0]["person"] == "Test User"

    # Cancel
    resp = client.delete(f"/api/jobs/{job_id}")
    assert resp.status_code == 200
    assert resp.json()["status"] == "cancelled"

def test_send_now():
    """Send immediately should queue as dispatched."""
    payload = {
        "person": "Jane",
        "network": "discord",
        "time": "2026-07-20T10:00:00Z",
        "text": "Immediate test"
    }
    resp = client.post("/api/send", json=payload)
    assert resp.status_code == 200
    assert resp.json()["status"] == "queued_for_immediate"

def test_templates():
    """Create, list, and delete templates."""
    # Create
    resp = client.post("/api/templates", json={
        "name": "Morning Greeting",
        "person": "Test User",
        "network": "telegram",
        "text": "Good morning!"
    })
    assert resp.status_code == 200
    tpl_id = resp.json()["id"]

    # List
    resp = client.get("/api/templates")
    assert resp.status_code == 200
    assert len(resp.json()["templates"]) == 1

    # Delete
    resp = client.delete(f"/api/templates/{tpl_id}")
    assert resp.status_code == 200

def test_history():
    """Send a message and verify it shows in history when reported."""
    # Use a unique person name to avoid cross-test pollution
    person = "HistoryTest_" + str(int(__import__("time").time()))

    # Schedule
    client.post("/api/schedule", json={
        "person": person,
        "network": "telegram",
        "time": "2024-01-01T09:00:00Z",
        "text": "Test message"
    })

    # Get outgoing (trigger dispatch)
    resp = client.get("/api/outgoing")
    jobs = [j for j in resp.json()["outgoing"] if j["person"] == person]
    assert len(jobs) == 1

    # Report as sent
    resp = client.post(f"/api/outgoing/{jobs[0]['id']}/result", json={"status": "sent"})
    assert resp.status_code == 200

    # Verify history
    resp = client.get("/api/history")
    history = [h for h in resp.json()["history"] if h["person"] == person]
    assert len(history) == 1
    assert history[0]["person"] == person
    assert history[0]["status"] == "sent"

def test_contacts():
    resp = client.get("/api/contacts")
    assert resp.status_code == 200
    assert "platforms" in resp.json()
