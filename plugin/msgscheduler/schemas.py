"""Tool schemas for the message-scheduler plugin — exactly what the model sees.

Every description states the *effect* and the *irreversible* part, because the
only thing standing between the model and a message actually sent to a real
human is this text.
"""

_MESSAGE_TARGET = {
    "person": {
        "type": "string",
        "description": (
            "Who receives it: a contact name from the scheduler's address book "
            "(use messages_find_contact first when unsure) or a raw platform "
            "identifier (chat id, @handle, phone, or a Beeper chat id starting with '!')."
        ),
    },
    "network": {
        "type": "string",
        "description": (
            "Platform the message travels over: telegram, whatsapp, signal, imessage, "
            "sms, matrix, email, or a Beeper-bridged network such as instagram, "
            "facebook/messenger or linkedin."
        ),
    },
    "text": {"type": "string", "description": "The message body to send."},
    "attachments": {
        "type": "array",
        "items": {"type": "string"},
        "description": (
            "Optional file paths. Each is copied into the scheduler's media dir and "
            "referenced as an attachment marker on the message."
        ),
    },
}

MESSAGES_SCHEDULE = {
    "name": "messages_schedule",
    "description": (
        "Queue a message to be sent at a future time through the Hermes Message "
        "Scheduler. The message is NOT sent now — it is written to the scheduler queue "
        "and a background dispatcher sends it when due. Use messages_send_now instead "
        "if it must go immediately. Returns the queue id."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            **_MESSAGE_TARGET,
            "when": {
                "type": "string",
                "description": (
                    "ISO 8601 datetime to send at, e.g. '2026-09-23T09:30:00' or "
                    "'2026-09-23T09:30:00+01:00'. Timestamps without an offset are read "
                    "in the scheduler's configured timezone (UTC by default)."
                ),
            },
            "replace_id": {
                "type": "integer",
                "description": "Optional queue id to cancel first (rescheduling an existing message).",
            },
        },
        "required": ["person", "network", "when", "text"],
    },
}

MESSAGES_SEND_NOW = {
    "name": "messages_send_now",
    "description": (
        "Send a message immediately through the Hermes Message Scheduler (queued as due "
        "now; the dispatcher picks it up on its next tick, seconds later). This reaches a "
        "real person on a real platform — confirm the recipient and body before calling it."
    ),
    "parameters": {
        "type": "object",
        "properties": {**_MESSAGE_TARGET},
        "required": ["person", "network", "text"],
    },
}

MESSAGES_LIST = {
    "name": "messages_list",
    "description": (
        "List messages still waiting in the scheduler queue (scheduled, not yet sent), "
        "oldest first, with their ids."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "limit": {"type": "integer", "description": "Maximum rows to return (default 50)."}
        },
    },
}

MESSAGES_CANCEL = {
    "name": "messages_cancel",
    "description": (
        "Cancel a queued message by its id so it will never be sent. Only queued "
        "messages can be cancelled — anything already sent lives in history."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "id": {"type": "integer", "description": "Queue id from messages_list or messages_schedule."}
        },
        "required": ["id"],
    },
}

MESSAGES_HISTORY = {
    "name": "messages_history",
    "description": (
        "Recent send history: what was sent, failed or missed, with the failure reason "
        "when there was one. Newest first."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "limit": {"type": "integer", "description": "Maximum rows to return (default 20)."},
            "failed_only": {
                "type": "boolean",
                "description": "Return only failed and missed entries.",
            },
        },
    },
}

MESSAGES_FIND_CONTACT = {
    "name": "messages_find_contact",
    "description": (
        "Search the scheduler's address book for a person by name and return the "
        "platform identifiers on file for them. Use this before scheduling when you are "
        "not certain which network (or which id) reaches someone."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Name, or part of a name, to search for."},
            "limit": {"type": "integer", "description": "Maximum people to return (default 10)."},
        },
        "required": ["query"],
    },
}

MESSAGES_DISPATCH = {
    "name": "messages_dispatch",
    "description": (
        "Run the scheduler's dispatcher right now instead of waiting for the next tick: "
        "every due message is sent and recorded. Safe to call at any time — it sends only "
        "what is already due. Use dry_run to preview what it would send without sending."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "dry_run": {
                "type": "boolean",
                "description": "Report what is due without sending anything (default false).",
            }
        },
    },
}

MESSAGES_STATUS = {
    "name": "messages_status",
    "description": (
        "Scheduler health at a glance: queue depth, how many are due now, next scheduled "
        "time, address-book size, sent/failed/missed counts, database path, and whether "
        "the host send bridge is reachable."
    ),
    "parameters": {"type": "object", "properties": {}},
}

ALL_SCHEMAS = {
    "messages_schedule": MESSAGES_SCHEDULE,
    "messages_send_now": MESSAGES_SEND_NOW,
    "messages_list": MESSAGES_LIST,
    "messages_cancel": MESSAGES_CANCEL,
    "messages_history": MESSAGES_HISTORY,
    "messages_find_contact": MESSAGES_FIND_CONTACT,
    "messages_dispatch": MESSAGES_DISPATCH,
    "messages_status": MESSAGES_STATUS,
}
