# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e.spec.ts >> Message Scheduler Plugin E2E >> UI mounts and shows correct tab highlighting
- Location: tests/e2e.spec.ts:13:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: locator('button:has-text("Compose")')
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for locator('button:has-text("Compose")')

```

```yaml
- complementary "Navigation":
  - text: Hermes Agent
  - button "Collapse"
  - navigation "Navigation":
    - list:
      - listitem:
        - link "Chat":
          - /url: /chat
      - listitem:
        - link "Sessions":
          - /url: /sessions
      - listitem:
        - link "Models":
          - /url: /models
      - listitem:
        - link "Logs":
          - /url: /logs
      - listitem:
        - link "Cron":
          - /url: /cron
      - listitem:
        - link "Skills":
          - /url: /skills
      - listitem:
        - link "Plugins":
          - /url: /plugins
      - listitem:
        - link "MCP":
          - /url: /mcp
      - listitem:
        - link "Channels":
          - /url: /channels
      - listitem:
        - link "Webhooks":
          - /url: /webhooks
      - listitem:
        - link "Pairing":
          - /url: /pairing
      - listitem:
        - link "Profiles":
          - /url: /profiles
      - listitem:
        - link "Config":
          - /url: /config
      - listitem:
        - link "Keys":
          - /url: /env
      - listitem:
        - link "System":
          - /url: /system
      - listitem:
        - link "Documentation":
          - /url: /docs
    - group "Plugins":
      - text: Plugins
      - list:
        - listitem:
          - link "Kanban":
            - /url: /kanban
        - listitem:
          - link "Achievements":
            - /url: /achievements
  - text: System
  - 'link "Gateway Status: Running Active Sessions: 0"':
    - /url: /sessions
    - paragraph: "Gateway Status: Running"
    - paragraph: "Active Sessions: 0"
  - status "Gateway Running"
  - list:
    - listitem:
      - button "Restart Gateway"
    - listitem:
      - button "Update Hermes"
  - button "Switch theme": Cyberpunk
  - button "Switch language": EN
  - text: v0.16.0
  - link "Nous Research":
    - /url: https://nousresearch.com
- banner:
  - heading "Sessions" [level=1]
  - text: "258"
- main:
  - text: "465 Total 465 Active in store 0 Archived 13626 Messages tui: 4 webui: 69 telegram: 10 cron: 158 cli: 16 whatsapp: 1"
  - radiogroup:
    - radio "Overview" [checked]
    - radio "History"
  - heading "Connected Platforms" [level=3]
  - text: "whatsapp Last update: 27m ago Connected telegram Last update: 27m ago Connected api_server Last update: 27m ago Connected webhook Last update: 27m ago Connected homeassistant Last update: 27m ago Connected"
  - heading "Recent Sessions" [level=3]
  - text: Checking Background Worker Status gemini-3.1-pro-preview · 38 msgs · 6m ago
  - paragraph: the workers seem to still have issues. anything I can do to ...
  - text: tui Kanban Skill for Scheduled Messages Plugin gemini-3.1-pro-preview · 86 msgs · 30m ago
  - paragraph: check the plan.md for the Scheduled Messages plugin. Would i...
  - text: tui Removing the Demo Extension Plugin gemini-3.1-pro-preview · 6 msgs · 1h ago
  - paragraph: let's remove the Demo Extension plugin
  - text: tui Untitled gemini-3.1-pro-preview · 31 msgs · 23m ago
  - paragraph: can you connect via Facebook Messenger?
  - text: webui Removing Scheduled Messages Icons gemini-3.1-pro-preview · 160 msgs · 1h ago
  - paragraph: you need to remove the "Scheduled Messages" icons from both ...
  - text: tui
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | 
  3  | test.describe('Message Scheduler Plugin E2E', () => {
  4  |   // Use the plugin route directly. Wait, Playwright tests might be running against 9119 where the API runs, 
  5  |   // but it's a React frontend built with Vite. 
  6  |   // The plan.md says: "E2E UI Testing: Playwright scripts (tests/e2e.spec.ts) asserting DOM mounts, rectangle hover states, and tab highlighting on port 9119."
  7  |   
  8  |   test.beforeEach(async ({ page }) => {
  9  |     // Navigate to the dashboard or plugin page
  10 |     await page.goto('http://127.0.0.1:9119/');
  11 |   });
  12 | 
  13 |   test('UI mounts and shows correct tab highlighting', async ({ page }) => {
  14 |     // Assert DOM mounts by checking the main header
  15 |     await expect(page.locator('text=Scheduled Messages').first()).toBeVisible();
  16 | 
  17 |     // Verify Compose tab is active by default
  18 |     const composeTab = page.locator('button:has-text("Compose")');
> 19 |     await expect(composeTab).toBeVisible();
     |                              ^ Error: expect(locator).toBeVisible() failed
  20 |     await expect(composeTab).toHaveClass(/border-blue-500/);
  21 | 
  22 |     // Verify the Compose form mounts
  23 |     await expect(page.locator('label:has-text("Recipient")')).toBeVisible();
  24 |     await expect(page.locator('label:has-text("Network")')).toBeVisible();
  25 | 
  26 |     // Verify Tab highlighting changes when clicking Queue
  27 |     const queueTab = page.locator('button:has-text("Queue")');
  28 |     await queueTab.click();
  29 |     await expect(queueTab).toHaveClass(/border-blue-500/);
  30 |     
  31 |     // Verify Queue view mounts
  32 |     await expect(page.locator('text=No messages in the queue').or(page.locator('button:has-text("Send Now")')).first()).toBeVisible();
  33 |   });
  34 | 
  35 |   test('Rectangle hover states on Settings buttons', async ({ page }) => {
  36 |     await page.goto('http://127.0.0.1:9119/');
  37 |     
  38 |     // Go to Settings tab
  39 |     const settingsTab = page.locator('button:has-text("Settings")');
  40 |     await settingsTab.click();
  41 | 
  42 |     // Check that we have checkboxes for platforms
  43 |     const whatsappCheckbox = page.locator('span:has-text("WhatsApp")');
  44 |     await expect(whatsappCheckbox).toBeVisible();
  45 | 
  46 |     // Check that the Rescan button has correct transition classes indicating it supports hover/active states
  47 |     const rescanBtn = page.locator('button:has-text("Rescan")').first();
  48 |     await expect(rescanBtn).toHaveClass(/hover:bg-gray-600/);
  49 |     await expect(rescanBtn).toHaveClass(/transition-all/);
  50 |   });
  51 | });
  52 | 
```