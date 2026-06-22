# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: e2e.spec.ts >> Message Scheduler Plugin E2E >> Rectangle hover states on Settings buttons
- Location: tests/e2e.spec.ts:35:3

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.click: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('button:has-text("Settings")')

```

# Page snapshot

```yaml
- generic [ref=e5]:
  - complementary "Navigation" [ref=e6]:
    - generic [ref=e7]:
      - generic [ref=e9]:
        - text: Hermes
        - text: Agent
      - button "Collapse" [ref=e10] [cursor=pointer]:
        - img [ref=e11]
    - navigation "Navigation" [ref=e14]:
      - list [ref=e15]:
        - listitem [ref=e16]:
          - link "Chat" [ref=e17] [cursor=pointer]:
            - /url: /chat
            - img [ref=e18]
            - generic [ref=e20]: Chat
        - listitem [ref=e21]:
          - link "Sessions" [ref=e22] [cursor=pointer]:
            - /url: /sessions
            - img [ref=e23]
            - generic [ref=e25]: Sessions
        - listitem [ref=e27]:
          - link "Models" [ref=e28] [cursor=pointer]:
            - /url: /models
            - img [ref=e29]
            - generic [ref=e32]: Models
        - listitem [ref=e33]:
          - link "Logs" [ref=e34] [cursor=pointer]:
            - /url: /logs
            - img [ref=e35]
            - generic [ref=e38]: Logs
        - listitem [ref=e39]:
          - link "Cron" [ref=e40] [cursor=pointer]:
            - /url: /cron
            - img [ref=e41]
            - generic [ref=e44]: Cron
        - listitem [ref=e45]:
          - link "Skills" [ref=e46] [cursor=pointer]:
            - /url: /skills
            - img [ref=e47]
            - generic [ref=e51]: Skills
        - listitem [ref=e52]:
          - link "Plugins" [ref=e53] [cursor=pointer]:
            - /url: /plugins
            - img [ref=e54]
            - generic [ref=e56]: Plugins
        - listitem [ref=e57]:
          - link "MCP" [ref=e58] [cursor=pointer]:
            - /url: /mcp
            - img [ref=e59]
            - generic [ref=e61]: MCP
        - listitem [ref=e62]:
          - link "Channels" [ref=e63] [cursor=pointer]:
            - /url: /channels
            - img [ref=e64]
            - generic [ref=e70]: Channels
        - listitem [ref=e71]:
          - link "Webhooks" [ref=e72] [cursor=pointer]:
            - /url: /webhooks
            - img [ref=e73]
            - generic [ref=e77]: Webhooks
        - listitem [ref=e78]:
          - link "Pairing" [ref=e79] [cursor=pointer]:
            - /url: /pairing
            - img [ref=e80]
            - generic [ref=e83]: Pairing
        - listitem [ref=e84]:
          - link "Profiles" [ref=e85] [cursor=pointer]:
            - /url: /profiles
            - img [ref=e86]
            - generic [ref=e91]: Profiles
        - listitem [ref=e92]:
          - link "Config" [ref=e93] [cursor=pointer]:
            - /url: /config
            - img [ref=e94]
            - generic [ref=e97]: Config
        - listitem [ref=e98]:
          - link "Keys" [ref=e99] [cursor=pointer]:
            - /url: /env
            - img [ref=e100]
            - generic [ref=e103]: Keys
        - listitem [ref=e104]:
          - link "System" [ref=e105] [cursor=pointer]:
            - /url: /system
            - img [ref=e106]
            - generic [ref=e108]: System
        - listitem [ref=e109]:
          - link "Documentation" [ref=e110] [cursor=pointer]:
            - /url: /docs
            - img [ref=e111]
            - generic [ref=e113]: Documentation
      - group "Plugins" [ref=e114]:
        - generic [ref=e115]: Plugins
        - list [ref=e116]:
          - listitem [ref=e117]:
            - link "Kanban" [ref=e118] [cursor=pointer]:
              - /url: /kanban
              - img [ref=e119]
              - generic [ref=e123]: Kanban
          - listitem [ref=e124]:
            - link "Achievements" [ref=e125] [cursor=pointer]:
              - /url: /achievements
              - img [ref=e126]
              - generic [ref=e128]: Achievements
    - generic [ref=e129]:
      - generic [ref=e130]: System
      - 'link "Gateway Status: Running Active Sessions: 0" [ref=e132] [cursor=pointer]':
        - /url: /sessions
        - generic [ref=e133]:
          - paragraph [ref=e134]: "Gateway Status: Running"
          - paragraph [ref=e135]: "Active Sessions: 0"
      - status "Gateway Running"
      - list [ref=e137]:
        - listitem [ref=e138]:
          - button "Restart Gateway" [ref=e139] [cursor=pointer]:
            - img [ref=e140]
            - generic [ref=e143]: Restart Gateway
        - listitem [ref=e144]:
          - button "Update Hermes" [ref=e145] [cursor=pointer]:
            - img [ref=e146]
            - generic [ref=e149]: Update Hermes
    - generic [ref=e151]:
      - button "Switch theme" [ref=e154] [cursor=pointer]:
        - generic [ref=e155]:
          - img [ref=e156]
          - generic [ref=e162]: Cyberpunk
      - button "Switch language" [ref=e165] [cursor=pointer]:
        - generic [ref=e167]: EN
    - generic [ref=e169]:
      - generic [ref=e170]: v0.16.0
      - link "Nous Research" [ref=e171] [cursor=pointer]:
        - /url: https://nousresearch.com
  - generic [ref=e172]:
    - banner [ref=e173]:
      - generic [ref=e175]:
        - heading "Sessions" [level=1] [ref=e176]
        - generic [ref=e178]: "258"
    - main [ref=e179]:
      - generic [ref=e182]:
        - generic [ref=e183]:
          - generic [ref=e184]:
            - generic [ref=e185]: "465"
            - generic [ref=e186]: Total
          - generic [ref=e187]:
            - generic [ref=e188]: "465"
            - generic [ref=e189]: Active in store
          - generic [ref=e190]:
            - generic [ref=e191]: "0"
            - generic [ref=e192]: Archived
          - generic [ref=e193]:
            - generic [ref=e194]: "13626"
            - generic [ref=e195]: Messages
          - generic [ref=e196]:
            - generic [ref=e197]: "tui: 4"
            - generic [ref=e198]: "webui: 69"
            - generic [ref=e199]: "telegram: 10"
            - generic [ref=e200]: "cron: 158"
            - generic [ref=e201]: "cli: 16"
            - generic [ref=e202]: "whatsapp: 1"
        - radiogroup [ref=e205]:
          - radio "Overview" [checked] [ref=e206] [cursor=pointer]
          - radio "History" [ref=e207] [cursor=pointer]
        - generic [ref=e208]:
          - generic [ref=e209]:
            - generic [ref=e211]:
              - img [ref=e212]
              - heading "Connected Platforms" [level=3] [ref=e218]
            - generic [ref=e219]:
              - generic [ref=e220]:
                - generic [ref=e221]:
                  - img [ref=e222]
                  - generic [ref=e226]:
                    - generic [ref=e227]: whatsapp
                    - generic [ref=e228]: "Last update: 28m ago"
                - generic [ref=e229]: Connected
              - generic [ref=e231]:
                - generic [ref=e232]:
                  - img [ref=e233]
                  - generic [ref=e237]:
                    - generic [ref=e238]: telegram
                    - generic [ref=e239]: "Last update: 28m ago"
                - generic [ref=e240]: Connected
              - generic [ref=e242]:
                - generic [ref=e243]:
                  - img [ref=e244]
                  - generic [ref=e248]:
                    - generic [ref=e249]: api_server
                    - generic [ref=e250]: "Last update: 28m ago"
                - generic [ref=e251]: Connected
              - generic [ref=e253]:
                - generic [ref=e254]:
                  - img [ref=e255]
                  - generic [ref=e259]:
                    - generic [ref=e260]: webhook
                    - generic [ref=e261]: "Last update: 28m ago"
                - generic [ref=e262]: Connected
              - generic [ref=e264]:
                - generic [ref=e265]:
                  - img [ref=e266]
                  - generic [ref=e270]:
                    - generic [ref=e271]: homeassistant
                    - generic [ref=e272]: "Last update: 28m ago"
                - generic [ref=e273]: Connected
          - generic [ref=e275]:
            - generic [ref=e277]:
              - img [ref=e278]
              - heading "Recent Sessions" [level=3] [ref=e281]
            - generic [ref=e282]:
              - generic [ref=e283]:
                - generic [ref=e284]:
                  - generic [ref=e285]: Checking Background Worker Status
                  - generic [ref=e286]: gemini-3.1-pro-preview · 38 msgs · 7m ago
                  - paragraph [ref=e287]: the workers seem to still have issues. anything I can do to ...
                - generic [ref=e288]:
                  - img [ref=e289]
                  - text: tui
              - generic [ref=e293]:
                - generic [ref=e294]:
                  - generic [ref=e295]: Kanban Skill for Scheduled Messages Plugin
                  - generic [ref=e296]: gemini-3.1-pro-preview · 86 msgs · 30m ago
                  - paragraph [ref=e297]: check the plan.md for the Scheduled Messages plugin. Would i...
                - generic [ref=e298]:
                  - img [ref=e299]
                  - text: tui
              - generic [ref=e303]:
                - generic [ref=e304]:
                  - generic [ref=e305]: Removing the Demo Extension Plugin
                  - generic [ref=e306]: gemini-3.1-pro-preview · 6 msgs · 1h ago
                  - paragraph [ref=e307]: let's remove the Demo Extension plugin
                - generic [ref=e308]:
                  - img [ref=e309]
                  - text: tui
              - generic [ref=e313]:
                - generic [ref=e314]:
                  - generic [ref=e315]: Untitled
                  - generic [ref=e316]: gemini-3.1-pro-preview · 31 msgs · 23m ago
                  - paragraph [ref=e317]: can you connect via Facebook Messenger?
                - generic [ref=e318]:
                  - img [ref=e319]
                  - text: webui
              - generic [ref=e323]:
                - generic [ref=e324]:
                  - generic [ref=e325]: Removing Scheduled Messages Icons
                  - generic [ref=e326]: gemini-3.1-pro-preview · 160 msgs · 1h ago
                  - paragraph [ref=e327]: you need to remove the "Scheduled Messages" icons from both ...
                - generic [ref=e328]:
                  - img [ref=e329]
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
  19 |     await expect(composeTab).toBeVisible();
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
> 40 |     await settingsTab.click();
     |                       ^ Error: locator.click: Test timeout of 30000ms exceeded.
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