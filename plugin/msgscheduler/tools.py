"""Agent-tool handlers for the message-scheduler plugin.

Handlers receive the model's arguments as a dict and return a string (the tool
result the model reads back). They are thin: all state lives in ``core.py``, so a
tool call, a dashboard REST call and a cron tick do exactly the same thing.
"""

from __future__ import annotations

import json
from pathlib import Path

from . import core
from .config import load_settings

_CTX = None


def configure(ctx) -> None:
    """Called once from ``register()`` so tools see the plugin's config.yaml values."""
    global _CTX
    _CTX = ctx


def _settings():
    return load_settings(_CTX)


def _dump(payload) -> str:
    return json.dumps(payload, default=str, ensure_ascii=False)


def _stage_attachments(paths, settings) -> tuple[list[str], list[str]]:
    """Copy model-supplied files into the media dir and return attachment markers.

    The bridge resolves attachments by URL, so the marker carries the served name
    (``[Attachment: <name>]``) while the returned list holds the API path.
    """
    staged, markers = [], []
    for raw in paths or []:
        src = Path(str(raw)).expanduser()
        if not src.is_file():
            raise FileNotFoundError(f"attachment not found: {raw}")
        saved = core.save_media(src.read_bytes(), src.name, settings)
        staged.append(f"/media/{saved['filename']}")
        markers.append(f"[Attachment: {saved['filename']}]")
    return staged, markers


def messages_schedule(args: dict, **_kwargs) -> str:
    settings = _settings()
    text = args.get("text", "")
    try:
        attachments, markers = _stage_attachments(args.get("attachments"), settings)
    except FileNotFoundError as exc:
        return _dump({"status": "error", "error": str(exc)})
    if markers:
        text = text + "\n\n" + "\n".join(markers)
    result = core.schedule(
        person=args["person"],
        network=args["network"],
        when=args["when"],
        text=text,
        attachments=attachments,
        replace_id=args.get("replace_id"),
        settings=settings,
    )
    return _dump(result)


def messages_send_now(args: dict, **_kwargs) -> str:
    settings = _settings()
    text = args.get("text", "")
    try:
        attachments, markers = _stage_attachments(args.get("attachments"), settings)
    except FileNotFoundError as exc:
        return _dump({"status": "error", "error": str(exc)})
    if markers:
        text = text + "\n\n" + "\n".join(markers)
    result = core.send_now(
        person=args["person"], network=args["network"], text=text,
        attachments=attachments, settings=settings,
    )
    return _dump(result)


def messages_list(args: dict, **_kwargs) -> str:
    settings = _settings()
    jobs = core.list_jobs(settings, limit=int(args.get("limit") or 50))
    return _dump({"count": len(jobs), "jobs": jobs})


def messages_cancel(args: dict, **_kwargs) -> str:
    return _dump(core.cancel(int(args["id"]), _settings()))


def messages_history(args: dict, **_kwargs) -> str:
    settings = _settings()
    entries = core.list_history(settings, limit=int(args.get("limit") or 20))
    if args.get("failed_only"):
        entries = [e for e in entries if e.get("status") in ("failed", "missed")]
    return _dump({"count": len(entries), "history": entries})


def messages_find_contact(args: dict, **_kwargs) -> str:
    settings = _settings()
    people = core.find_contacts(args.get("query", ""), settings,
                                limit=int(args.get("limit") or 10))
    if not people:
        return _dump({"count": 0, "people": [],
                      "note": "no address-book match — a raw platform identifier also works"})
    return _dump({"count": len(people), "people": people})


def messages_dispatch(args: dict, **_kwargs) -> str:
    settings = _settings()
    report = core.dispatch_due(settings, dry_run=bool(args.get("dry_run")))
    return _dump({
        "scanned": report["scanned"],
        "sent": [e["id"] for e in report["sent"]],
        "failed": [{"id": e["id"], "error": e["error"]} for e in report["failed"]],
        "missed": [e["id"] for e in report["missed"]],
        "dry_run": report["dry_run"],
    })


def messages_status(args: dict, **_kwargs) -> str:  # noqa: ARG001 - schema has no params
    settings = _settings()
    summary = core.summary(settings)
    bridge = core.bridge_status(settings)
    reachable = bridge.get("status") not in (None, "bridge_error")
    summary["bridge"] = {"reachable": reachable,
                         "url": settings.bridge_url,
                         "detail": bridge.get("status") or bridge.get("error", "unreachable")}
    return _dump(summary)
