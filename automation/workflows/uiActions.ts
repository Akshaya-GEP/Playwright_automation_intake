import { expect, type Locator, type Page } from '@playwright/test';
import { waitForAiEvents } from './aiEvents';

/**
 * Universal UI actions used across agent workflows.
 *
 * Keep this file free of flow-specific logic (supplier-offboarding, amendments, etc.).
 */

export function getAskMeAnythingField(page: Page): Locator {
  return page
    .getByRole('textbox', { name: /^prompt$/i })
    .or(page.getByRole('textbox', { name: /prompt|ask me anything/i }))
    .or(page.getByPlaceholder(/ask me anything/i))
    .or(page.getByLabel(/ask me anything/i))
    .first();
}

// Tracks whether we’ve already allowed Qube Mesh to “settle” on a given page.
// This prevents adding extra delay for every subsequent prompt submission.
const primedPages = new WeakSet<Page>();

export async function primeQubeMesh(page: Page): Promise<void> {
  if (primedPages.has(page)) return;

  // Best-effort: ensure initial HTML is ready, then give the app a moment to hydrate/attach handlers.
  // Avoid networkidle here (websockets/long polling can keep it from ever reaching idle).
  await page.waitForLoadState('domcontentloaded', { timeout: 60_000 }).catch(() => { });
  await page.waitForTimeout(2500).catch(() => { });

  primedPages.add(page);
}

export async function enterPromptAndSubmit(
  page: Page,
  query: string,
  aiEventsCount: number | null,
): Promise<number | null> {
  // On first prompt, wait a little after Qube Mesh loads so the textbox is truly ready.
  await primeQubeMesh(page);

  const askField = getAskMeAnythingField(page);
  await expect(askField).toBeVisible({ timeout: 180_000 });
  // After Qube Mesh loads, the prompt can be visible before it's actually ready to type into.
  // Waiting for "editable" + a small settle delay removes a lot of flakiness.
  await expect(askField).toBeEditable({ timeout: 180_000 }).catch(() => { });
  await page.waitForTimeout(1500).catch(() => { });
  await askField.click({ timeout: 30_000 }).catch(() => { });
  await askField.fill(query);
  await askField.press('Enter').catch(() => { });
  return await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
}

export function getProceedButton(page: Page): Locator {
  // Some screens render multiple "Proceed" buttons; default to the first one.
  return page.getByRole('button', { name: /^proceed$/i }).first();
}

export function getProceedWithRequestControl(page: Page): Locator {
  return page
    .getByRole('button', { name: /proceed with request/i })
    .or(page.getByRole('link', { name: /proceed with request/i }))
    .first();
}

export function getCreateRequestControl(page: Page): Locator {
  return page
    .getByRole('button', { name: /^create request$/i })
    .or(page.getByRole('button', { name: /create request/i }))
    .or(page.locator('button').filter({ hasText: /create request/i }))
    .first();
}

async function clickControlAndWaitAi(
  page: Page,
  control: Locator,
  aiEventsCount: number | null,
  opts?: { visibleTimeoutMs?: number; enabledTimeoutMs?: number },
): Promise<number | null> {
  const visibleTimeoutMs = opts?.visibleTimeoutMs ?? 240_000;
  const enabledTimeoutMs = opts?.enabledTimeoutMs ?? 240_000;

  await expect(control).toBeVisible({ timeout: visibleTimeoutMs });
  await expect(control).toBeEnabled({ timeout: enabledTimeoutMs });

  // Make the click as robust as possible (mirrors patterns used in existing agents).
  await control.scrollIntoViewIfNeeded().catch(() => { });
  await page.waitForTimeout(200).catch(() => { });

  try {
    await control.click({ timeout: 30_000 });
  } catch {
    try {
      await control.click({ timeout: 30_000, force: true });
    } catch {
      const box = await control.boundingBox().catch(() => null);
      if (!box) throw new Error('uiActions: could not click control (no bounding box)');
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
  }
  return await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
}

export async function clickProceed(page: Page, aiEventsCount: number | null): Promise<number | null> {
  return await clickControlAndWaitAi(page, getProceedButton(page), aiEventsCount, {
    visibleTimeoutMs: 120_000,
    enabledTimeoutMs: 60_000,
  });
}

export async function clickProceedWithRequest(page: Page, aiEventsCount: number | null): Promise<number | null> {
  return await clickControlAndWaitAi(page, getProceedWithRequestControl(page), aiEventsCount, {
    visibleTimeoutMs: 240_000,
    enabledTimeoutMs: 240_000,
  });
}

export async function clickCreateRequest(page: Page, aiEventsCount: number | null): Promise<number | null> {
  return await clickControlAndWaitAi(page, getCreateRequestControl(page), aiEventsCount, {
    visibleTimeoutMs: 240_000,
    enabledTimeoutMs: 240_000,
  });
}



export async function clickYesForQuestion(page: Page, question: Locator) {
  await expect(question).toBeVisible({ timeout: 240_000 });
  await page.waitForTimeout(500);

  const candidateRoots: Locator[] = [];
  let cur = question;
  for (let i = 0; i < 8; i++) {
    cur = cur.locator('..');
    candidateRoots.push(cur);
  }

  for (const root of candidateRoots) {
    const yesByText = root.locator('button:has-text("Yes"):not([disabled])').first();
    if (await yesByText.isVisible().catch(() => false)) {
      try {
        await expect(yesByText).toBeEnabled({ timeout: 10_000 });
        await yesByText.click({ timeout: 30_000 });
        return;
      } catch {
        try {
          await yesByText.click({ timeout: 30_000, force: true });
          return;
        } catch {
          const box = await yesByText.boundingBox().catch(() => null);
          if (box) {
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            return;
          }
        }
      }
    }

    const yesButtonsByRole = root.getByRole('button', { name: /^yes$/i });
    const count = await yesButtonsByRole.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const yesBtn = yesButtonsByRole.nth(i);
      const isDisabled = await yesBtn.getAttribute('disabled').catch(() => null);
      if (isDisabled !== null) continue;

      if (await yesBtn.isVisible().catch(() => false)) {
        try {
          await expect(yesBtn).toBeEnabled({ timeout: 10_000 });
          await yesBtn.click({ timeout: 30_000 });
          return;
        } catch {
          try {
            await yesBtn.click({ timeout: 30_000, force: true });
            return;
          } catch {
            const box = await yesBtn.boundingBox().catch(() => null);
            if (box) {
              await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
              return;
            }
          }
        }
      }
    }
  }

  const yesGlobal = page.locator('button:has-text("Yes"):not([disabled])').first();
  await expect(yesGlobal).toBeVisible({ timeout: 60_000 });
  await expect(yesGlobal).toBeEnabled({ timeout: 10_000 });
  try {
    await yesGlobal.click({ timeout: 30_000 });
  } catch {
    await yesGlobal.click({ timeout: 30_000, force: true }).catch(async () => {
      const box = await yesGlobal.boundingBox().catch(() => null);
      if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    });
  }
}

export async function clickProceedIfPresent(page: Page, timeoutMs = 10_000): Promise<boolean> {
  const start = Date.now();
  const candidates = page.locator('button').filter({ hasText: /^\s*Proceed\s*$/i }).filter({ hasNotText: /proceed with request/i });
  while (Date.now() - start < timeoutMs) {
    const count = await candidates.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const btn = candidates.nth(i);
      if (await btn.isVisible() && await btn.isEnabled()) {
        await btn.click({ timeout: 30_000 }).catch(() => btn.click({ force: true }));
        return true;
      }
    }
    await page.waitForTimeout(250);
  }
  return false;
}
