"""Message Scheduler — dashboard/backend REST half.

Mounted by Hermes at ``/api/plugins/message-scheduler/`` (the dashboard's own
auth gate sits in front of every route here). The desktop app reaches the same
routes through ``ctx.rest``; the web dashboard tab reaches them through
``SDK.fetchJSON``.

Paths in this file are relative to that mount, so a route defined as ``/jobs``
is ``/api/plugins/message-scheduler/jobs`` on the wire.

This is the plugin-era successor to the standalone container's ``api.py``: same
operations, no uvicorn, no CORS middleware (same-origin by construction), no
background threads (the dispatch cadence belongs to cron, not to a web worker).
"""

from __future__ import annotations

import sys
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

# Hermes mounts this file by PATH, as a standalone module named
# hermes_dashboard_plugin_<id> — there is no package context, so a relative import
# (`from .. import core`) raises "beyond top-level package" and the plugin silently
# fails to mount. Bootstrap the plugin dir onto sys.path instead.
_PLUGIN_DIR = Path(__file__).resolve().parents[1]
if str(_PLUGIN_DIR) not in sys.path:
    sys.path.insert(0, str(_PLUGIN_DIR))

from msgscheduler import core  # noqa: E402
from msgscheduler.config import load_settings  # noqa: E402

router = APIRouter(tags=["message-scheduler"])


def _settings():
    return load_settings()


# --- Models ----------------------------------------------------------------


class ScheduleRequest(BaseModel):
    person: str
    network: str
    when: str = Field(..., description="ISO 8601 timestamp")
    text: str
    attachments: list[str] | None = None
    replace_id: int | None = None


class SendRequest(BaseModel):
    person: str
    network: str
    text: str
    attachments: list[str] | None = None


class ContactBody(BaseModel):
    name: str
    network: str
    identifier: str = ""


class ContactPatch(BaseModel):
    name: str | None = None
    network: str | None = None
    identifier: str | None = None


class ContactImport(BaseModel):
    contacts: list[ContactBody]
    source: str = "sync"


class TemplateBody(BaseModel):
    name: str
    person: str = ""
    network: str = ""
    text: str = ""


class NotifyBody(BaseModel):
    channel: str = ""
    identifier: str = ""
    user_name: str = "there"


class OutgoingResult(BaseModel):
    status: str  # sent | failed | missed
    error: str = ""
    job_id: str | None = None


# --- Status ----------------------------------------------------------------


@router.get("/summary")
def get_summary():
    return core.summary(_settings())


@router.get("/config")
def get_config():
    settings = _settings()
    return {
        "bridge_url": settings.bridge_url,
        "db_path": str(settings.db_path),
        "media_dir": str(settings.media_dir),
        "timezone": settings.timezone,
        "grace_seconds": settings.grace_seconds,
        "dispatch_limit": settings.dispatch_limit,
        "history_limit": settings.history_limit,
        "media_retention_days": settings.media_retention_days,
        "mount": "/api/plugins/message-scheduler",
    }


@router.get("/platforms/status")
def platforms_status():
    return core.bridge_status(_settings())


# --- Queue -----------------------------------------------------------------


@router.get("/jobs")
def get_jobs(limit: int = Query(default=200, ge=1, le=1000)):
    jobs = core.list_jobs(_settings(), limit=limit)
    return {"jobs": jobs, "count": len(jobs)}


@router.post("/jobs")
def create_job(req: ScheduleRequest):
    if req.attachments:
        # Accept either already-served names or absolute paths from the host.
        for name in req.attachments:
            if not core.media_path(Path(name).name, _settings()):
                raise HTTPException(status_code=400,
                                    detail=f"unknown attachment: {name}")
    try:
        result = core.schedule(req.person, req.network, req.when, req.text,
                               attachments=req.attachments, replace_id=req.replace_id,
                               settings=_settings())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return result


@router.delete("/jobs/{job_id}")
def cancel_job(job_id: int):
    result = core.cancel(job_id, _settings())
    if result["status"] == "not_found":
        raise HTTPException(status_code=404, detail="Job not found or already dispatched")
    return result


@router.post("/send")
def send_now(req: SendRequest):
    return core.send_now(req.person, req.network, req.text,
                         attachments=req.attachments, settings=_settings())


@router.post("/dispatch")
def dispatch_now(dry_run: bool = False):
    return core.dispatch_due(_settings(), dry_run=dry_run)


# --- History ---------------------------------------------------------------


@router.get("/history")
def get_history(limit: int = Query(default=200, ge=1, le=1000)):
    entries = core.list_history(_settings(), limit=limit)
    return {"history": entries, "count": len(entries)}


@router.delete("/history/{entry_id}")
def delete_history(entry_id: int):
    result = core.delete_history_entry(entry_id, _settings())
    if result["status"] == "not_found":
        raise HTTPException(status_code=404, detail="Entry not found")
    return result


# --- Contacts --------------------------------------------------------------


@router.get("/contacts")
def get_contacts():
    return {"contacts": core.list_contacts(_settings())}


@router.get("/contacts/search")
def search_contacts(q: str = Query(default=""), limit: int = Query(default=10, ge=1, le=100)):
    return {"people": core.find_contacts(q, _settings(), limit=limit)}


@router.post("/contacts")
def create_contact(body: ContactBody):
    return core.add_contact(body.name, body.network, body.identifier, settings=_settings())


@router.put("/contacts/{contact_id}")
def patch_contact(contact_id: int, body: ContactPatch):
    return core.update_contact(contact_id, body.name, body.network, body.identifier,
                               _settings())


@router.delete("/contacts/{contact_id}")
def remove_contact(contact_id: int):
    return core.delete_contact(contact_id, _settings())


@router.post("/contacts/import")
def import_contacts(body: ContactImport):
    return core.import_contacts([c.model_dump() for c in body.contacts], source=body.source,
                                settings=_settings())


@router.post("/contacts/sync/{network}")
def sync_contacts(network: str):
    return core.sync_contacts(network, _settings())


# --- Templates -------------------------------------------------------------


@router.get("/templates")
def get_templates():
    return {"templates": core.list_templates(_settings())}


@router.post("/templates")
def create_template(body: TemplateBody):
    return core.add_template(body.name, body.person, body.network, body.text, _settings())


@router.delete("/templates/{template_id}")
def remove_template(template_id: int):
    return core.delete_template(template_id, _settings())


# --- Media -----------------------------------------------------------------


@router.post("/upload")
async def upload(file: UploadFile = File(...)):
    settings = _settings()
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="empty upload")
    saved = core.save_media(data, file.filename or "file", settings)
    return {"path": saved["path"], "url": f"/api/plugins/message-scheduler/media/{saved['filename']}",
            "name": saved["name"], "filename": saved["filename"]}


@router.get("/media/{filename}")
def get_media(filename: str):
    path = core.media_path(filename, _settings())
    if path is None:
        raise HTTPException(status_code=404, detail="File not found")
    return FileResponse(path)


# --- Notification settings -------------------------------------------------


@router.get("/settings/notify")
def get_notify():
    return core.get_notify_settings(_settings())


@router.post("/settings/notify")
def set_notify(body: NotifyBody):
    return core.set_notify_settings(body.channel, body.identifier, body.user_name, _settings())


# --- Bridge proxies --------------------------------------------------------


@router.post("/generate")
def generate(body: dict):
    prompt = (body or {}).get("prompt", "")
    if not prompt:
        raise HTTPException(status_code=400, detail="missing prompt")
    return core.generate_text(prompt, _settings())


@router.post("/search-beeper")
def search_beeper(body: dict):
    return core.search_beeper((body or {}).get("query", ""), _settings())


@router.post("/bridge-create-chat")
def bridge_create_chat(body: dict):
    return core.create_chat((body or {}).get("accountID", ""),
                            (body or {}).get("participantID", ""), _settings())


# --- Host-dispatcher mode (compat with the container's cron contract) ------


@router.get("/outgoing")
def get_outgoing():
    """Claim due messages for an external sender (host cron), if one is configured."""
    return {"outgoing": core.claim_outgoing(_settings())}


@router.post("/outgoing/{job_id}/result")
def report_outgoing(job_id: int, result: OutgoingResult):
    try:
        outcome = core.report_result(job_id, result.status, result.error, _settings())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if outcome["status"] == "not_found":
        raise HTTPException(status_code=404, detail="Job not found")
    return outcome


@router.post("/release-stranded")
def release_stranded():
    """Put claimed-but-unreported rows back in the queue (external dispatcher died)."""
    return {"released": core.release_stranded(_settings())}
