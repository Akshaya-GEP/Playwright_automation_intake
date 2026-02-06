import { expect, type Locator, type Page } from '@playwright/test';

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Standard end-of-flow condition for ALL agent workflows:
 *
 * - If "SEND FOR VALIDATION" is displayed: click it and wait for "Congratulations"
 * - If ONLY "EDIT PROJECT REQUEST" is displayed (no send button): end the flow
 */
export async function finalizeRequestFlow(
  page: Page,
  opts?: { endTimeoutMs?: number; sendAppearTimeoutMs?: number; congratulationsTimeoutMs?: number },
): Promise<
  | { endedBy: 'congratulations'; clickedSendForValidation: false }
  | { endedBy: 'send-for-validation'; clickedSendForValidation: true }
  | { endedBy: 'edit-project-request-only'; clickedSendForValidation: false }
> {
  const endTimeoutMs = opts?.endTimeoutMs ?? 240_000;
  const sendAppearTimeoutMs = opts?.sendAppearTimeoutMs ?? 30_000;
  const congratulationsTimeoutMs = opts?.congratulationsTimeoutMs ?? 180_000;

  // Prefer role-based selectors but keep robust text fallbacks (some UIs render CTAs without proper roles).
  const sendForValidation = page
    .getByRole('button', { name: /send (for )?validation/i })
    .or(page.getByRole('link', { name: /send (for )?validation/i }))
    .or(page.locator('button').filter({ hasText: /send.*validation/i }))
    .or(page.getByText(/send (for )?validation/i).filter({ hasNot: page.locator('code') }))
    .first();

  const editProjectRequest = page
    .getByRole('button', { name: /edit project request/i })
    .or(page.getByRole('link', { name: /edit project request/i }))
    .or(page.locator('button').filter({ hasText: /edit project request/i }))
    .or(page.getByText(/edit project request/i).filter({ hasNot: page.locator('code') }))
    .first();

  const congratulationsMessage = page
    .getByText(/congratulations/i)
    .or(page.getByText(/congrats/i))
    .first();

  // Some flows may already show the congratulations message (or show it quickly).
  // Prefer it as an immediate terminal signal so we don't hang waiting for buttons that may not render.
  await Promise.race([
    editProjectRequest.waitFor({ state: 'visible', timeout: endTimeoutMs }),
    sendForValidation.waitFor({ state: 'visible', timeout: endTimeoutMs }),
    congratulationsMessage.waitFor({ state: 'visible', timeout: endTimeoutMs }),
  ]).catch(async (e) => {
    // If race timed out, re-throw a clearer error
    throw new Error(`finalizeRequestFlow: did not reach end screen within ${endTimeoutMs}ms: ${String(e)}`);
  });

  if (await congratulationsMessage.isVisible().catch(() => false)) {
    return { endedBy: 'congratulations', clickedSendForValidation: false };
  }

  // If Edit Project Request is visible but Send for Validation is not, that's still a successful terminal state.
  const hasEdit = await editProjectRequest.isVisible().catch(() => false);
  const hasSendNow = await sendForValidation.isVisible().catch(() => false);
  if (hasEdit && !hasSendNow) {
    return { endedBy: 'edit-project-request-only', clickedSendForValidation: false };
  }

  // If send-for-validation is present, click it and wait for congratulations; otherwise end.
  await sendForValidation
    .waitFor({ state: 'visible', timeout: sendAppearTimeoutMs })
    .catch(() => {});

  const hasSend = await sendForValidation.isVisible().catch(() => false);
  if (!hasSend) {
    return { endedBy: 'edit-project-request-only', clickedSendForValidation: false };
  }

  // Click Send for Validation with a few fallbacks
  try {
    await expect(sendForValidation).toBeEnabled({ timeout: 60_000 });
    await sendForValidation.click({ timeout: 30_000 });
  } catch {
    try {
      await sendForValidation.click({ timeout: 30_000, force: true });
    } catch {
      const box = await sendForValidation.boundingBox().catch(() => null);
      if (!box) throw new Error('finalizeRequestFlow: could not click Send for Validation (no bounding box)');
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
  }

  await expect(congratulationsMessage).toBeVisible({ timeout: congratulationsTimeoutMs });
  return { endedBy: 'send-for-validation', clickedSendForValidation: true };
}

