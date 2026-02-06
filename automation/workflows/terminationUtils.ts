import { expect, type Page } from '@playwright/test';
import { escapeRegex } from './utils';

export type TerminationStatus = 'future' | 'immediate';

export function normalizeTerminationStatus(v?: string): TerminationStatus | null {
  const s = (v || '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'future' || s === 'future date' || s === 'terminate for a future date') return 'future';
  if (s === 'immediate' || s === 'terminate immediately') return 'immediate';
  return null;
}

export async function clickTerminationReason(page: Page, reasonTerminate?: string) {
  const v = (reasonTerminate || '').trim();
  if (v) {
    console.log(`Looking for termination reason: "${v}"`);
    
    // Wait for the reason prompt to be visible first
    const reasonPrompt = page.getByText(/what is the reason for terminating this contract\?/i);
    await expect(reasonPrompt.first()).toBeVisible({ timeout: 60_000 }).catch(() => {});
    
    // Wait for buttons to be available and enabled
    await page.waitForSelector('button:not([disabled])', { timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(1000); // Additional wait for buttons to be fully rendered

    // Prefer Playwright clicks over page.evaluate() so we get auto-waits for re-renders/navigation.
    // Strategy 1: Try flexible regex match (spaces and dashes are interchangeable)
    // Build pattern that allows spaces or dashes (including em dash and en dash) between words
    const words = v.split(/[\s\u2014\u2013\u002D]+/).filter(w => w.length > 0); // Split on spaces, em dash, en dash, regular dash
    const flexiblePattern = words.map(w => escapeRegex(w)).join('[\\s\u2014\u2013\u002D]+'); // Match any dash type or space
    const byTextFlexible = page.getByRole('button', { name: new RegExp(flexiblePattern, 'i') }).first();
    if (await byTextFlexible.count() > 0) {
      try {
        await expect(byTextFlexible).toBeVisible({ timeout: 60_000 });
        await expect(byTextFlexible).toBeEnabled({ timeout: 30_000 });
        await byTextFlexible.click();
        await settleAfterReasonSelection(page);
        console.log(`Successfully clicked using flexible regex match`);
        return;
      } catch (e) {
        console.log(`Flexible regex match failed: ${e}, trying key words...`);
      }
    }
    
    // Strategy 2: Match by key words (e.g., "Service Related" should match "Termination for Cause – Service Related")
    const keyWords = words.filter(w => w.length > 2); // Filter out short words
    if (keyWords.length >= 2) {
      // Try matching with the last 2 words (usually the specific reason)
      const lastWords = keyWords.slice(-2).join('[\\s\u2014\u2013\u002D]+'); // Match any dash type or space
      const byKeyWords = page.getByRole('button', { name: new RegExp(lastWords, 'i') }).first();
      if (await byKeyWords.count() > 0) {
        try {
          await expect(byKeyWords).toBeVisible({ timeout: 60_000 });
          await expect(byKeyWords).toBeEnabled({ timeout: 30_000 });
          await byKeyWords.click();
          await settleAfterReasonSelection(page);
          console.log(`Successfully clicked using key words match`);
          return;
        } catch (e) {
          console.log(`Key words match failed: ${e}, trying exact match...`);
        }
      }
    }
    
    // Strategy 3: Try exact match (original behavior)
    const byText = page.getByRole('button', { name: new RegExp(escapeRegex(v), 'i') }).first();
    if (await byText.count() > 0) {
      try {
        await expect(byText).toBeVisible({ timeout: 60_000 });
        await expect(byText).toBeEnabled({ timeout: 30_000 });
        await byText.click();
        await settleAfterReasonSelection(page);
        console.log(`Successfully clicked using exact match`);
        return;
      } catch (e) {
        console.log(`Exact match failed: ${e}, using fallback...`);
      }
    }
    
    console.log(`All matching strategies failed for "${v}", using fallback...`);
  }

  // Default (back-compat): pick "Termination for cause" if present, otherwise first enabled option.
  console.log(`Using fallback: selecting first available termination reason`);
  const forCause = page.getByRole('button', { name: /termination for cause/i }).first();
  if (await forCause.isVisible().catch(() => false)) {
    await expect(forCause).toBeEnabled({ timeout: 30_000 });
    await forCause.click();
    await settleAfterReasonSelection(page);
    return;
  }

  const firstEnabled = page.locator('button:not([disabled])').filter({ hasText: /\S/ }).first();
  await expect(firstEnabled).toBeVisible({ timeout: 240_000 });
  await expect(firstEnabled).toBeEnabled({ timeout: 30_000 });
  await firstEnabled.click();
  await settleAfterReasonSelection(page);
}

async function settleAfterReasonSelection(page: Page) {
  // The UI often re-renders right after selecting a reason; without a settle,
  // immediate follow-up locators can race and cause flaky "context destroyed/page closed" errors.
  await page.waitForLoadState('domcontentloaded').catch(() => {});
  await Promise.race([
    page.getByText(/would you like to create the project request with these details\?/i).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {}),
    page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {}),
    page.waitForTimeout(3_000),
  ]).catch(() => {});
  // Extra small buffer for animations / streaming UI
  await page.waitForTimeout(2_000);
}


