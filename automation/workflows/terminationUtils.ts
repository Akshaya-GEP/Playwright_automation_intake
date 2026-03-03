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
    
    // The "reason" UI is often rendered as clickable tiles/links (not always <button>),
    // so waiting for generic buttons can accidentally pick header/nav controls.
    // Instead, wait for any known reason option text to show up.
    const anyReasonOptionSignal = page
      .getByText(
        /Termination for Cause|Termination of Convenience|Contract End\/No Renewal Needed|Regulatory Changes/i,
      )
      .first();
    await anyReasonOptionSignal.waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {});
    await page.waitForTimeout(500); // small settle for tile layout/animations

    // Prefer Playwright clicks over page.evaluate() so we get auto-waits for re-renders/navigation.
    // Strategy 1: Try flexible regex match (spaces and dashes are interchangeable)
    // Build pattern that allows spaces or dashes (including em dash and en dash) between words
    const words = v.split(/[\s\u2014\u2013\u002D]+/).filter(w => w.length > 0); // Split on spaces, em dash, en dash, regular dash
    const flexiblePattern = words.map(w => escapeRegex(w)).join('[\\s\u2014\u2013\u002D]+'); // Match any dash type or space
    const byTextFlexible = findReasonOption(page, new RegExp(flexiblePattern, 'i')).first();
    if (await byTextFlexible.count().catch(() => 0)) {
      try {
        await safeClick(page, byTextFlexible);
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
      const byKeyWords = findReasonOption(page, new RegExp(lastWords, 'i')).first();
      if (await byKeyWords.count().catch(() => 0)) {
        try {
          await safeClick(page, byKeyWords);
          await settleAfterReasonSelection(page);
          console.log(`Successfully clicked using key words match`);
          return;
        } catch (e) {
          console.log(`Key words match failed: ${e}, trying exact match...`);
        }
      }
    }
    
    // Strategy 3: Try exact match (original behavior)
    const byText = findReasonOption(page, new RegExp(escapeRegex(v), 'i')).first();
    if (await byText.count().catch(() => 0)) {
      try {
        await safeClick(page, byText);
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
  const forCause = findReasonOption(page, /termination for cause/i).first();
  if (await forCause.isVisible().catch(() => false)) {
    await safeClick(page, forCause);
    await settleAfterReasonSelection(page);
    return;
  }

  // Last resort: click the first visible tile/title for any reason option (avoid header/nav buttons).
  const firstReasonTile = findReasonOption(
    page,
    /Termination for Cause|Termination of Convenience|Contract End\/No Renewal Needed|Regulatory Changes/i,
  ).first();
  await safeClick(page, firstReasonTile, { visibleTimeoutMs: 240_000 });
  await settleAfterReasonSelection(page);
}

function findReasonOption(page: Page, nameOrText: RegExp) {
  // Options can be rendered as buttons, links, or clickable tiles with text.
  // Order here matters: prefer semantic controls, fall back to text nodes.
  return page
    .getByRole('button', { name: nameOrText })
    .or(page.getByRole('link', { name: nameOrText }))
    .or(page.getByText(nameOrText).filter({ hasNot: page.locator('code') }));
}

async function safeClick(
  page: Page,
  target: ReturnType<Page['locator']>,
  opts?: { visibleTimeoutMs?: number },
) {
  const visibleTimeoutMs = opts?.visibleTimeoutMs ?? 60_000;
  await expect(target).toBeVisible({ timeout: visibleTimeoutMs });
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(150);

  try {
    await target.click({ timeout: 30_000 });
    return;
  } catch {
    // Force click to bypass overlays intercepting pointer events (seen with prompt-tabs/panel-wrapper)
    try {
      await target.click({ timeout: 30_000, force: true });
      return;
    } catch {
      const box = await target.boundingBox().catch(() => null);
      if (!box) throw new Error('safeClick: no bounding box for termination reason option');
      await page.mouse.click(box.x + box.width / 2, box.y + Math.min(10, box.height / 2));
    }
  }
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


