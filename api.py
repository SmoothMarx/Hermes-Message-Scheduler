import sqlite3
import os
import subprocess
from fastapi import FastAPI, HTTPException, UploadFile, File
from pydantic import BaseModel
from typing import Optional, List

app = FastAPI(title="Message Scheduler Plugin")

DB_PATH = os.environ.get("MESSAGE_SCHEDULER_DB", "scheduler.db")

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            person TEXT,
            network TEXT,
            text TEXT
        )
    """)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            person TEXT,
            network TEXT,
            status TEXT,
            time TEXT,
            text TEXT,
            error TEXT
        )
    """)
    conn.commit()
    conn.close()

@app.on_event("startup")
def startup_event():
    init_db()

# Models
class TemplateCreate(BaseModel):
    name: str
    person: str
    network: str
    text: str

class ScheduleRequest(BaseModel):
    person: str
    network: str
    time: str
    text: str

# Routes
@app.get("/api/plugins/scheduled-messages/templates")
def get_templates():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM templates")
    rows = cursor.fetchall()
    conn.close()
    return [dict(row) for row in rows]

@app.post("/api/plugins/scheduled-messages/templates")
def create_template(template: TemplateCreate):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO templates (name, person, network, text) VALUES (?, ?, ?, ?)",
        (template.name, template.person, template.network, template.text)
    )
    conn.commit()
    new_id = cursor.lastrowid
    conn.close()
    return {"id": new_id, **template.model_dump()}

@app.delete("/api/plugins/scheduled-messages/templates/{template_id}")
def delete_template(template_id: int):
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM templates WHERE id = ?", (template_id,))
    conn.commit()
    conn.close()
    return {"status": "deleted"}

@app.get("/api/plugins/scheduled-messages/history")
def get_history():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM history ORDER BY id DESC LIMIT 100")
    rows = cursor.fetchall()
    conn.close()
    return {"history": [dict(row) for row in rows]}

@app.post("/api/plugins/scheduled-messages/upload")
def upload_media(file: UploadFile = File(...)):
    return {"path": f"/tmp/hermes_scheduler_media/{file.filename}"}

last_scheduled = {}

@app.post("/api/plugins/scheduled-messages/schedule")
def schedule_message(req: ScheduleRequest):
    import time
    now = time.time()
    dedup_key = f"{req.person}:{req.network}:{req.time}:{req.text}"
    if dedup_key in last_scheduled and now - last_scheduled[dedup_key] < 60:
        return {"status": "ignored_dedup"}
    last_scheduled[dedup_key] = now

    # hermes cron create
    args = [
        "hermes", "cron", "create",
        "--name", f"send_msg_{int(now)}",
        req.time,
        f"hermes send '{req.network}:{req.person}' '{req.text}'"
    ]
    res = subprocess.run(args, capture_output=True, text=True)
    if res.returncode != 0:
        raise HTTPException(status_code=500, detail=res.stderr)
    return {"status": "scheduled"}

@app.post("/api/plugins/scheduled-messages/send")
def send_now(req: ScheduleRequest):
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        args = ["hermes", "send", f"{req.network}:{req.person}", req.text]
        res = subprocess.run(args, capture_output=True, text=True)
        if res.returncode != 0:
            cursor.execute(
                "INSERT INTO history (person, network, status, time, text, error) VALUES (?, ?, ?, ?, ?, ?)",
                (req.person, req.network, "Failed", req.time, req.text, res.stderr)
            )
            conn.commit()
            raise HTTPException(status_code=500, detail=res.stderr)
        
        cursor.execute(
            "INSERT INTO history (person, network, status, time, text, error) VALUES (?, ?, ?, ?, ?, ?)",
            (req.person, req.network, "Sent", req.time, req.text, "")
        )
        conn.commit()
        return {"status": "sent"}
    finally:
        # Keep only last 100
        cursor.execute("DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT 100)")
        conn.commit()
        conn.close()

@app.delete("/api/plugins/scheduled-messages/jobs/{job_id}")
def cancel_job(job_id: str):
    res = subprocess.run(["hermes", "cron", "remove", job_id], capture_output=True, text=True)
    if res.returncode != 0:
        raise HTTPException(status_code=500, detail=res.stderr)
    return {"status": "cancelled", "id": job_id}

@app.post("/api/plugins/scheduled-messages/contacts/sync/{net}")
def sync_contacts(net: str):
    return {"status": "syncing", "network": net}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=9119)
