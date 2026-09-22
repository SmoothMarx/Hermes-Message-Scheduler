"""Behaviour contracts for the scheduler core.

These pin what the queue *does* — dedup, replacement, offline detection, target
resolution, pruning, media scoping — not the shape of the source.
"""

from __future__ import annotations

import json
import time
from datetime import datetime, timedelta, timezone

from msgscheduler import core


def _iso(minutes: float) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()


def _insert_raw(settings, *, scheduled_at, created_at, status="pending", person="Ana",
                network="telegram", text="hi", attachments="[]") -> int:
    conn = core.connect(settings)
    try:
        cursor = conn.execute(
            """INSERT INTO messages (person, network, text, scheduled_at, status, attachments, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (person, network, text, scheduled_at, status, attachments, created_at),
        )
        conn.commit()
        return int(cursor.lastrowid or 0)
    finally:
        conn.close()


# --- time ------------------------------------------------------------------


def test_offset_bearing_time_is_converted_to_utc(settings):
    assert core.normalize_time("2026-09-23T09:30:00+02:00", settings) == "2026-09-23 07:30:00"


def test_naive_time_uses_the_configured_timezone(settings):
    settings.timezone = "UTC"
    assert core.normalize_time("2026-09-23T09:30:00", settings) == "2026-09-23 09:30:00"

    settings.timezone = "Europe/Lisbon"  # WEST in September = UTC+1
    assert core.normalize_time("2026-09-23T09:30:00", settings) == "2026-09-23 08:30:00"


def test_unparsable_time_is_a_value_error(settings):
    try:
        core.normalize_time("next tuesday", settings)
    except ValueError:
        return
    raise AssertionError("expected ValueError")


# --- queue -----------------------------------------------------------------


def test_schedule_then_list_roundtrip(settings):
    result = core.schedule("Ana", "telegram", _iso(60), "hello", settings=settings)
    assert result["status"] == "scheduled"

    jobs = core.list_jobs(settings)
    assert [j["person"] for j in jobs] == ["Ana"]
    assert jobs[0]["time"].endswith("Z")  # ISO for the UI, not raw SQLite


def test_identical_pending_schedule_is_deduped(settings):
    first = core.schedule("Ana", "telegram", _iso(60), "hello", settings=settings)
    second = core.schedule("Ana", "telegram", _iso(60), "hello", settings=settings)

    assert second["status"] == "ignored_dedup"
    assert second["id"] == first["id"]
    assert len(core.list_jobs(settings)) == 1


def test_scheduling_with_same_text_at_a_different_time_is_not_deduped(settings):
    core.schedule("Ana", "telegram", _iso(60), "hello", settings=settings)
    core.schedule("Ana", "telegram", _iso(120), "hello", settings=settings)
    assert len(core.list_jobs(settings)) == 2


def test_replace_id_cancels_the_original(settings):
    original = core.schedule("Ana", "telegram", _iso(60), "old", settings=settings)
    replacement = core.schedule("Ana", "telegram", _iso(90), "new",
                                replace_id=original["id"], settings=settings)

    jobs = core.list_jobs(settings)
    assert [j["id"] for j in jobs] == [replacement["id"]]
    assert jobs[0]["text"] == "new"


def test_cancel_removes_from_the_queue_and_is_idempotent(settings):
    job = core.schedule("Ana", "telegram", _iso(60), "hello", settings=settings)
    assert core.cancel(job["id"], settings)["status"] == "cancelled"
    assert core.list_jobs(settings) == []
    # second cancel is a not_found, never an exception
    assert core.cancel(job["id"], settings)["status"] == "not_found"


def test_send_now_queues_as_due_immediately(settings):
    result = core.send_now("Ana", "telegram", "now please", settings=settings)
    assert result["status"] == "queued_for_immediate"
    assert core.summary(settings)["due_now"] == 1


# --- dispatch --------------------------------------------------------------


def test_dispatch_sends_due_messages_and_records_history(settings, bridge):
    core.schedule("Ana", "telegram", _iso(-1), "hello there", settings=settings)

    report = core.dispatch_due(settings)

    assert report["scanned"] == 1
    assert len(report["sent"]) == 1
    assert bridge.payloads("send") == [
        {"network": "telegram", "person": "Ana", "text": "hello there", "attachments": []}
    ]
    history = core.list_history(settings)
    assert [h["status"] for h in history] == ["sent"]
    assert core.list_jobs(settings) == []


def test_dispatch_uses_the_contact_identifier_when_known(settings, bridge):
    core.add_contact("Ana", "telegram", "5551234", settings=settings)
    core.schedule("Ana", "telegram", _iso(-1), "hello", settings=settings)

    core.dispatch_due(settings)

    assert bridge.payloads("send")[0]["person"] == "5551234"


def test_dispatch_records_bridge_failure_with_the_reason(settings, monkeypatch, bridge):
    bridge.responses["send"] = {"status": "bridge_error", "error": "connection refused"}
    core.schedule("Ana", "telegram", _iso(-1), "hello", settings=settings)

    report = core.dispatch_due(settings)

    assert report["failed"][0]["error"] == "connection refused"
    history = core.list_history(settings)
    assert history[0]["status"] == "failed"
    assert history[0]["error"] == "connection refused"


def test_message_due_during_downtime_is_missed_not_sent_late(settings, bridge):
    # due 10 minutes ago AND created 10 minutes ago = the process was not running
    ten_minutes_ago = (datetime.now(timezone.utc) - timedelta(minutes=10)).strftime("%Y-%m-%d %H:%M:%S")
    _insert_raw(settings, scheduled_at=ten_minutes_ago, created_at=ten_minutes_ago)

    report = core.dispatch_due(settings)

    assert len(report["missed"]) == 1
    assert report["sent"] == []
    assert bridge.calls == []  # nothing left the machine
    assert core.list_history(settings)[0]["status"] == "missed"


def test_message_created_just_now_but_due_minutes_ago_is_sent(settings, bridge):
    # The backdating case: a human schedules something for 2 minutes ago on purpose.
    core.schedule("Ana", "telegram", _iso(-2), "catch up", settings=settings)

    report = core.dispatch_due(settings)

    assert len(report["sent"]) == 1
    assert core.list_history(settings)[0]["status"] == "sent"


def test_future_messages_are_not_dispatched(settings, bridge):
    core.schedule("Ana", "telegram", _iso(30), "later", settings=settings)
    report = core.dispatch_due(settings)
    assert report == {"scanned": 0, "sent": [], "failed": [], "missed": [], "dry_run": False}
    assert bridge.calls == []


def test_dry_run_sends_nothing_and_changes_nothing(settings, bridge):
    core.schedule("Ana", "telegram", _iso(-1), "hello", settings=settings)

    report = core.dispatch_due(settings, dry_run=True)

    assert len(report["sent"]) == 1
    assert bridge.calls == []
    assert len(core.list_jobs(settings)) == 1  # still queued
    assert core.list_history(settings) == []


def test_history_is_pruned_to_the_configured_limit(settings, bridge):
    settings.history_limit = 3
    for _ in range(5):
        core.send_now("Ana", "telegram", "burst", settings=settings)
        core.dispatch_due(settings)

    assert len(core.list_history(settings)) == 3


def test_dispatch_respects_the_batch_limit(settings, bridge):
    settings.dispatch_limit = 2
    for i in range(4):
        core.send_now("Ana", "telegram", f"msg {i}", settings=settings)

    assert core.dispatch_due(settings)["scanned"] == 2


def test_beeper_network_resolves_a_chat_id_once_and_reuses_it(settings, bridge):
    bridge.responses["create-chat"] = {"chat_id": "!room:beeper.local"}
    core.add_contact("Bea", "instagram", "somehandle", settings=settings)
    core.schedule("Bea", "instagram", _iso(-1), "hi", settings=settings)

    core.dispatch_due(settings)

    assert bridge.payloads("create-chat") == [
        {"accountID": "instagramgo", "participantID": "@instagramgo_somehandle:beeper.local"}
    ]
    assert bridge.payloads("send")[0]["person"] == "!room:beeper.local"

    # The chat id is written back, so the second send needs no create-chat call.
    core.schedule("Bea", "instagram", _iso(-1), "again", settings=settings)
    core.dispatch_due(settings)
    assert len(bridge.payloads("create-chat")) == 1


def test_dispatch_notifies_the_configured_channel(settings, bridge):
    core.set_notify_settings("telegram", "999", "Pedro", settings=settings)
    core.schedule("Ana", "telegram", _iso(-1), "hello", settings=settings)

    core.dispatch_due(settings)

    notifications = [p for p in bridge.payloads("send") if p["network"] == "telegram"
                     and p["person"] == "999"]
    assert len(notifications) == 1
    assert "Ana" in notifications[0]["text"]


def test_no_notification_when_the_channel_is_unset(settings, bridge):
    core.schedule("Ana", "telegram", _iso(-1), "hello", settings=settings)
    core.dispatch_due(settings)
    assert len(bridge.payloads("send")) == 1  # the message only


# --- external dispatcher mode ---------------------------------------------


def test_claim_outgoing_then_report_result_moves_the_row_to_history(settings):
    job = core.send_now("Ana", "telegram", "hello", settings=settings)

    claimed = core.claim_outgoing(settings)
    assert [c["id"] for c in claimed] == [job["id"]]
    assert core.summary(settings)["due_now"] == 0  # claimed rows are not re-offered

    assert core.report_result(job["id"], "sent", settings=settings)["status"] == "recorded"
    assert core.list_history(settings)[0]["status"] == "sent"
    assert core.list_jobs(settings) == []


def test_report_result_rejects_an_unknown_status(settings):
    job = core.send_now("Ana", "telegram", "hello", settings=settings)
    try:
        core.report_result(job["id"], "maybe", settings=settings)
    except ValueError:
        return
    raise AssertionError("expected ValueError")


def test_release_stranded_returns_claimed_rows_to_the_queue(settings):
    core.send_now("Ana", "telegram", "hello", settings=settings)
    core.claim_outgoing(settings)
    assert core.release_stranded(settings) == 1
    assert core.summary(settings)["due_now"] == 1


# --- contacts --------------------------------------------------------------


def test_contacts_are_aggregated_by_name(settings):
    core.add_contact("Ana", "telegram", "555", settings=settings)
    core.add_contact("Ana", "whatsapp", "+3519", settings=settings)
    core.add_contact("Bea", "signal", "", settings=settings)

    people = core.list_contacts(settings)
    assert [p["name"] for p in people] == ["Ana", "Bea"]
    assert {n["network"] for n in people[0]["networks"]} == {"telegram", "whatsapp"}


def test_find_contacts_prefers_prefix_matches(settings):
    core.add_contact("Marianne", "telegram", "", settings=settings)
    core.add_contact("Ana Maria", "telegram", "", settings=settings)

    found = core.find_contacts("maria", settings)
    # "Marianne" starts with the query, so it ranks above the mid-string match.
    assert [p["name"] for p in found] == ["Marianne", "Ana Maria"]


def test_import_contacts_replaces_only_that_source(settings):
    core.add_contact("Manual", "telegram", "", source="manual", settings=settings)
    core.import_contacts([{"name": "Synced", "network": "telegram", "identifier": "1"}],
                         source="sync", settings=settings)
    core.import_contacts([{"name": "Synced2", "network": "telegram", "identifier": "2"}],
                         source="sync", settings=settings)

    names = {p["name"] for p in core.list_contacts(settings)}
    assert names == {"Manual", "Synced2"}


def test_import_skips_rows_without_a_name_or_network(settings):
    result = core.import_contacts(
        [{"name": "", "network": "telegram"}, {"name": "Ok", "network": ""},
         {"name": "Fine", "network": "telegram"}],
        settings=settings,
    )
    assert result["inserted"] == 1


# --- media -----------------------------------------------------------------


def test_save_and_cleanup_only_touch_the_media_dir(settings, tmp_path):
    outside = tmp_path / "keepme.txt"
    outside.write_text("not ours")

    saved = core.save_media(b"bytes", "photo.png", settings)
    assert core.media_path(saved["filename"], settings) is not None

    removed = core.cleanup_message_media(f"see [Attachment: {saved['filename']}] and "
                                         f"[Attachment: {outside}]", settings)

    assert saved["filename"] in " ".join(removed)
    assert not (settings.media_dir / saved["filename"]).exists()
    assert outside.exists()  # an absolute path outside the media dir is never deleted


def test_media_path_refuses_traversal(settings):
    assert core.media_path("../scheduler.db", settings) is None
    assert core.media_path("sub/dir.png", settings) is None


def test_cleanup_old_media_honours_the_retention_window(settings):
    saved = core.save_media(b"old", "old.png", settings)
    stale = settings.media_dir / saved["filename"]
    old = time.time() - (40 * 86400)
    import os
    os.utime(stale, (old, old))

    fresh = core.save_media(b"new", "new.png", settings)

    assert core.cleanup_old_media(settings, days=30) == 1
    assert not stale.exists()
    assert (settings.media_dir / fresh["filename"]).exists()


# --- summary / settings ----------------------------------------------------


def test_summary_reports_queue_health_without_lying(settings):
    core.send_now("Ana", "telegram", "due", settings=settings)
    core.schedule("Bea", "telegram", _iso(120), "later", settings=settings)

    summary = core.summary(settings)

    assert summary["queued"] == 2
    assert summary["due_now"] == 1
    assert summary["next_at"] is not None
    assert summary["db_path"] == str(settings.db_path)
    assert summary["contacts"] == 0
    assert summary["history"] == {"sent": 0, "failed": 0, "missed": 0}


def test_notify_settings_roundtrip_through_the_db(settings):
    assert core.get_notify_settings(settings)["user_name"] == "there"
    core.set_notify_settings("signal", "+351", "Pedro", settings=settings)
    stored = core.get_notify_settings(settings)
    assert stored == {"channel": "signal", "identifier": "+351", "user_name": "Pedro"}


def test_init_db_is_idempotent_and_creates_a_missing_column(settings):
    core.init_db(settings)
    # drop the column-era table and recreate without it, then migrate again
    conn = core.connect(settings)
    conn.execute("DROP TABLE messages")
    conn.execute("""CREATE TABLE messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT, person TEXT NOT NULL, network TEXT NOT NULL,
        text TEXT NOT NULL, scheduled_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
        error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))""")
    conn.commit()
    conn.close()

    core.init_db(settings)

    conn = core.connect(settings)
    columns = {r["name"] for r in conn.execute("PRAGMA table_info(messages)")}
    conn.close()
    assert {"attachments", "dispatched_at"} <= columns


def test_template_crud(settings):
    created = core.add_template("Birthday", "Ana", "telegram", "Happy birthday!", settings)
    assert [t["name"] for t in core.list_templates(settings)] == ["Birthday"]
    assert core.delete_template(created["id"], settings)["status"] == "deleted"
    assert core.list_templates(settings) == []
