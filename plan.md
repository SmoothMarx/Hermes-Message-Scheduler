# Message Scheduler Plan (V2 Master Specification)

## 1. Project Overview & Architecture
The Message Scheduler is a full-stack Hermes Dashboard plugin designed to schedule, manage, and audit messages sent through Hermes native integrations (Telegram, WhatsApp, Beeper, etc.). 
- **Frontend:** TypeScript, React (TSX), Vite, Tailwind CSS. Compiled to `dist/index.js`.
- **Dashboard Exclusive:** This plugin explicitly drops support for the Chat WebUI iframe sandbox. It relies entirely on the Native Hermes React SDK (`window.__HERMES_PLUGIN_SDK__`) to prevent dual-bootstrapping, minimize CORS issues, and utilize native browser APIs.
- **Backend:** Python, FastAPI. Mounted natively via Hermes plugin `api.py` manifest directive.
- **Component Strategy:** Strict modularity (e.g., `<ComposeTab />`, `<QueueTab />`, `<ContactAutocomplete />`).

## 2. Global UI/UX & Accessibility Standards
- **Theming:** Inherits native Hermes CSS variables (`var(--background-base)`, `var(--text-primary)`) to match user themes (Cyberpunk, Light).
- **Interactive Feedback:** All clickable elements (buttons, list items) use `transition-all duration-150 active:scale-95 active:brightness-90 transform`.
- **Focus/Selection Visibility:** Dropdowns and selectable items use high-contrast rectangle outlines (`hover:outline hover:outline-2 hover:outline-white`) on hover/focus to clearly indicate selection.
- **Tab State Visibility:** The currently selected navigation tab (e.g., Compose, Queue) must be explicitly highlighted (e.g., active color underline or border).
- **Z-Index & Layouts:** Overlay elements, custom dropdowns, and native `<select>` elements MUST share the exact same explicit background color (e.g., `bg-gray-800`) and elevated z-indexes (`z-50`) to prevent transparency bleed-through.

## 3. Global Backend & Networking Protocols
- **API Routing:** Frontend calls must target `/api/plugins/scheduled-messages/...` and include `Authorization: Bearer ${window.__HERMES_SESSION_TOKEN__}`.
- **Security:** The backend MUST validate the Session Token against Hermes internal session manager before processing *any* `POST` or `DELETE` requests.
- **Execution Method:** Communication with Hermes strictly via Subprocess CLI execution (e.g., `subprocess.run(['hermes', 'cron', 'create', ...])`).
- **Error Handling:** Strict JSON Schema. All backend errors return HTTP 400/500 structured as: `{ "error_code": "STRING_KEY", "message": "Human readable description" }`. Frontend can utilize explicit DOM error messages or native browser `alert()`/toasts, as the dashboard is not restricted by iframe sandboxing.
- **Idempotency:** 60-second backend deduplication window preventing duplicate cron jobs if frontend retries.

## 4. Core Data Models & Storage (SQLite)
The plugin relies on Python native `sqlite3` to store job history reliably. Do not use flat file JSON appends via bash.
**SQLite Table Schemas:**
- `templates`: `id` (INTEGER PRIMARY KEY), `name` (TEXT), `person` (TEXT), `network` (TEXT), `text` (TEXT)
- `history`: `id` (INTEGER PRIMARY KEY), `person` (TEXT), `network` (TEXT), `status` (TEXT), `time` (TEXT), `text` (TEXT), `error` (TEXT)

**TypeScript Interfaces:**
```typescript
interface Contact { name: string; networks: string[]; }
interface ScheduledJob { id: string; person: string; network: string; time: string; text: string; }
interface HistoryEntry { person: string; network: string; status: "Sent" | "Failed"; time: string; text: string; error?: string; }
interface SettingsState { enabledPlatforms: string[]; contactSource: "hermes_native" | "local_json" | "merged"; }
```

## 5. Features

### Feature A: Compose & Templates
**UI Description:** Form to select a recipient, choose a network, pick a time, and compose text (with Markdown preview) or attach media.
- **Contact Scope & Internal Database:** 
    - The plugin MUST pull the full contact list from all selected social networks (e.g., Google Contacts, Telegram, WhatsApp, Discord, Beeper).
    - If a user enables a network in the Settings tab and Hermes has an active integration (or API keys/tokens are available), the backend must scrape that network for all contacts and aggregate them into the plugin's internal SQLite database.
    - **No Deduplication:** The scraper must insert all raw contacts exactly as retrieved. If a user exists on 3 platforms, they appear 3 times in the dropdown.
    - To easily discern the source of the contact, the dropdown MUST include an icon of the respective social network placed directly before the contact's name (e.g., [Telegram Icon] SmoothMarx), alongside any secondary identifiers like handles.
- **Time Selection:** Uses a custom React component (e.g., `react-datepicker`) for visual consistency, plus Quick Pills (`+1 Hour`).
- **Timezone Resolution:** Timezone is bound to the Hermes Server location. Frontend serializes chosen time to UTC (`toISOString()`); backend parses and passes UTC to `hermes cron create`.
- **Media Attachments:** Opens local file picker. Uploaded via `POST /upload` to a `/tmp/` directory before scheduling. Temp file lives only as long as the message (deleted immediately after sending or if canceled/expired after 30 days).
- **Templates:** Allows users to 1-click populate forms or save the current form as a named template to the SQLite DB via a custom React modal prompt.

### Feature B: Pending Queue
**UI Description:** Live countdown of all waiting messages, parsed robustly from `hermes cron list`.
- **State Management:** Background polling pings the backend every 10-15 seconds for sync.
- **Optimistic UI:** Clicking Cancel/Send Now hides the job instantly, snapping back with a toast error if the backend fails.
- **Edit Flow:** Intercepts pending job, passes data back to Compose form. *Crucially*, the original job is preserved until the user clicks "Schedule" on the revised version.
- **Offline Handling:** If host machine sleeps past a scheduled window, the job is marked "Missed" in history for manual retry.

### Feature C: History & Audit
**UI Description:** Log of successful/failed sends (read from SQLite).
- **Storage Limits:** Auto-pruning (e.g., keep the last 100 messages or 30 days maximum).
- **Retry Logic:** Clicking 'Retry' on a failed message loads its data back into the Compose tab.

### Feature D: Settings
**UI Description:** User preferences for platform visibility and sync.
- **Rescan Sync:** Clicking "Rescan [Network]" triggers a forced background sync for a specific platform to update the SQLite cache.

## 6. Action Matrix (Button-to-Backend Contract)
| Tab | Button | Frontend UI Action | Backend API Called | Backend CLI / OS Behavior |
|---|---|---|---|---|
| **Compose** | `Time Quick Pills` | Calculates UTC timestamp, populates Datepicker. | *None* | N/A - Pure frontend. |
| **Compose** | `Load Template` | Overwrites Compose fields. | `GET /templates` | Queries SQLite templates table. |
| **Compose** | `Attach Media` | Opens OS picker, holds blob. | `POST /upload` | Saves to `/tmp/hermes_scheduler_media/`, returns absolute path. |
| **Compose** | `Save as Template` | Custom modal prompts for Name. | `POST /templates` | Writes new row to SQLite. |
| **Compose** | `Schedule Message` | Validates, serializes UTC, shows spinner. | `POST /schedule` | Validates token, dedupes, runs `hermes cron create`. |
| **Queue** | `Edit` | Navigates to Compose, pre-populates fields. | *None directly* | Original job deleted only when revised version is POSTed. |
| **Queue** | `Send Now` | Shows spinner, removes optimistically. | `POST /send` | Runs `hermes send`, logs to DB, removes cron job. |
| **Queue** | `Cancel` | Removes job optimistically. | `DELETE /jobs/{id}` | Runs `hermes cron remove <id>`, deletes temp media. |
| **History** | `Retry` | Navigates to Compose, pre-populating fields. | *None directly* | N/A - Pure frontend state transfer. |
| **Settings** | `Toggle Platform` | Checkbox toggles platform visibility. | *None* | Saved to `localStorage`. |
| **Settings** | `Rescan [Network]` | Triggers spinning loading state. | `POST /contacts/sync/{net}` | Forces the Python backend to re-execute native API scraping against the target network (e.g., Google People API, Telegram MTProto) and write the raw results into the internal SQLite contacts database. |
| **Settings** | `Save Settings` | Validates, shows "✅ Saved" toast. | *None* | Writes preferences to `localStorage`. |

## 7. Testing Strategy
- **E2E UI Testing:** `Playwright` scripts (`tests/e2e.spec.ts`) asserting DOM mounts, rectangle hover states, and tab highlighting on port 9119. Native browser APIs (`alert`, `confirm`) are considered safe to test in this environment.
- **Backend Unit Testing:** Python `pytest` suite mocking `subprocess.run` to verify CLI command argument order (e.g., `--name` before time).

## 8. Development Methodology (Kanban Workflow)
- **Multi-Agent Orchestration:** The project is executed via the Hermes Kanban system. The master plan is decomposed into parallel lanes and dependent tasks.
- **Dedicated Worker Profiles:** Work will be routed to single-purpose, project-specific Hermes profiles to keep context boundaries clean and avoid polluting general-use profiles. Expected roster:
  - `msg-frontend`: Specialist for React, Vite, Tailwind, and dashboard DOM interactions.
  - `msg-backend`: Specialist for Python, FastAPI, SQLite, and Hermes CLI subprocess integration.
  - `msg-qa`: Dedicated reviewer for Playwright/pytest and validating OS-level cron behavior.
