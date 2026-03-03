import { expect, type Locator, type Page } from '@playwright/test';

function aiEventsLocator(page: Page): Locator {
  // The UI shows a pill/label like: "AI Events (14)"
  // We match by text because the exact element type may vary (button/div/etc).
  return page.getByText(/AI Events\s*\(\d+\)/i).first();
}

async function readAiEventsCount(page: Page): Promise<number | null> {
  const loc = aiEventsLocator(page);
  if (!(await loc.count())) return null;
  const text = (await loc.first().innerText().catch(() => '')).trim();
  const m = text.match(/AI Events\s*\((\d+)\)/i);
  return m ? Number(m[1]) : null;
}

/**
 * Wait until the "AI Events (N)" indicator is visible, and (if `previousCount` is provided)
 * wait until the count changes. Returns the latest observed count (or null if unparseable).
 */
export async function waitForAiEvents(page: Page, previousCount?: number | null, timeoutMs = 180_000) {
  const loc = aiEventsLocator(page);

  // Latest UI change: the "AI Events (N)" pill is not guaranteed to be present/visible.
  // Treat it as best-effort synchronization only — NEVER fail the workflow if it's missing.
  const has = await loc.count().catch(() => 0);
  if (!has) {
    // Small settle so downstream locators have a chance to attach after streaming UI updates.
    await page.waitForLoadState('domcontentloaded').catch(() => {});
    await page.waitForTimeout(750);
    return previousCount ?? null;
  }

  // If present, wait briefly for it to become visible; if not, continue anyway.
  await loc.waitFor({ state: 'visible', timeout: Math.min(5_000, timeoutMs) }).catch(() => {});

  if (previousCount === undefined) {
    return await readAiEventsCount(page);
  }

  // In some flows, the UI updates without changing the "(N)" count (e.g. same event bucket reused).
  // Best-effort: wait briefly for a count change, but don't block the workflow for a long time.
  try {
    const changeTimeoutMs = Math.min(10_000, timeoutMs);
    await expect
      .poll(async () => await readAiEventsCount(page), { timeout: changeTimeoutMs })
      .not.toBe(previousCount);
  } catch {
    // proceed with current UI state; subsequent step-specific waits should still synchronize correctly
  }

  return await readAiEventsCount(page);
}


