import pytest
import sys
import os
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
import sqlite3

# Set test DB before importing api
os.environ["MESSAGE_SCHEDULER_DB"] = "test_scheduler.db"
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import api
from api import app, init_db

@pytest.fixture(autouse=True)
def setup_teardown():
    init_db()
    yield
    if os.path.exists("test_scheduler.db"):
        os.remove("test_scheduler.db")

client = TestClient(app)

@patch("api.subprocess.run")
def test_schedule_message_cron_args(mock_subprocess_run):
    mock_res = MagicMock()
    mock_res.returncode = 0
    mock_res.stdout = "Created job"
    mock_res.stderr = ""
    mock_subprocess_run.return_value = mock_res
    
    payload = {
        "person": "John Doe",
        "network": "telegram",
        "time": "2026-06-20T09:00:00Z",
        "text": "Hello John!"
    }
    
    response = client.post("/api/plugins/scheduled-messages/schedule", json=payload)
    assert response.status_code == 200
    assert response.json() == {"status": "scheduled"}
    
    # Verify subprocess.run was called with correct arguments
    mock_subprocess_run.assert_called_once()
    args_called = mock_subprocess_run.call_args[0][0]
    
    # Assert 'hermes cron create'
    assert args_called[0:3] == ["hermes", "cron", "create"]
    
    # Assert '--name' comes before the time string
    assert args_called[3] == "--name"
    assert args_called[4].startswith("send_msg_")
    assert args_called[5] == "2026-06-20T09:00:00Z"
    assert args_called[6] == "hermes send 'telegram:John Doe' 'Hello John!'"

@patch("api.subprocess.run")
def test_send_now_subprocess(mock_subprocess_run):
    mock_res = MagicMock()
    mock_res.returncode = 0
    mock_subprocess_run.return_value = mock_res

    payload = {
        "person": "Jane",
        "network": "discord",
        "time": "2026-06-19T10:00:00Z",
        "text": "Test now"
    }

    response = client.post("/api/plugins/scheduled-messages/send", json=payload)
    assert response.status_code == 200

    mock_subprocess_run.assert_called_once()
    args_called = mock_subprocess_run.call_args[0][0]
    assert args_called == ["hermes", "send", "discord:Jane", "Test now"]

    # Verify history is saved
    conn = sqlite3.connect("test_scheduler.db")
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM history")
    rows = cursor.fetchall()
    assert len(rows) == 1
    assert rows[0]["person"] == "Jane"
    assert rows[0]["status"] == "Sent"
    conn.close()
