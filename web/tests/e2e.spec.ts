import { test, expect } from '@playwright/test';

test.describe('Message Scheduler Plugin E2E', () => {
  // Use the plugin route directly. Wait, Playwright tests might be running against 9119 where the API runs, 
  // but it's a React frontend built with Vite. 
  // The plan.md says: "E2E UI Testing: Playwright scripts (tests/e2e.spec.ts) asserting DOM mounts, rectangle hover states, and tab highlighting on port 9119."
  
  test.beforeEach(async ({ page }) => {
    // Navigate to the dashboard or plugin page
    await page.goto('http://127.0.0.1:9119/');
  });

  test('UI mounts and shows correct tab highlighting', async ({ page }) => {
    // Assert DOM mounts by checking the main header
    await expect(page.locator('text=Scheduled Messages').first()).toBeVisible();

    // Verify Compose tab is active by default
    const composeTab = page.locator('button:has-text("Compose")');
    await expect(composeTab).toBeVisible();
    await expect(composeTab).toHaveClass(/border-blue-500/);

    // Verify the Compose form mounts
    await expect(page.locator('label:has-text("Recipient")')).toBeVisible();
    await expect(page.locator('label:has-text("Network")')).toBeVisible();

    // Verify Tab highlighting changes when clicking Queue
    const queueTab = page.locator('button:has-text("Queue")');
    await queueTab.click();
    await expect(queueTab).toHaveClass(/border-blue-500/);
    
    // Verify Queue view mounts
    await expect(page.locator('text=No messages in the queue').or(page.locator('button:has-text("Send Now")')).first()).toBeVisible();
  });

  test('Rectangle hover states on Settings buttons', async ({ page }) => {
    await page.goto('http://127.0.0.1:9119/');
    
    // Go to Settings tab
    const settingsTab = page.locator('button:has-text("Settings")');
    await settingsTab.click();

    // Check that we have checkboxes for platforms
    const whatsappCheckbox = page.locator('span:has-text("WhatsApp")');
    await expect(whatsappCheckbox).toBeVisible();

    // Check that the Rescan button has correct transition classes indicating it supports hover/active states
    const rescanBtn = page.locator('button:has-text("Rescan")').first();
    await expect(rescanBtn).toHaveClass(/hover:bg-gray-600/);
    await expect(rescanBtn).toHaveClass(/transition-all/);
  });
});
