import { expect, type Page } from '@playwright/test';
import { waitForAiEvents } from './aiEvents';
import { escapeRegex } from './utils';

export async function selectOffboardingReason(
  page: Page,
  reasonTextRaw: string | undefined,
  aiEventsCount: number | null,
): Promise<number | null> {
  const reasonButtons = page
    .getByRole('button', {
      name: /no longer doing business|not approved by tprm|quick setup and pay/i,
    })
    .or(
      page.getByRole('button').filter({
        hasText: /no longer doing business|not approved by tprm|quick setup and pay/i,
      }),
    );

  await expect.poll(async () => await reasonButtons.count(), { timeout: 120_000 }).toBeGreaterThan(0);

  const trimmed = reasonTextRaw?.trim();
  if (trimmed) {
    const reasonPattern = escapeRegex(trimmed).replace(/\\\s+/g, '\\s+');
    const reasonRe = new RegExp(reasonPattern, 'i');

    const desiredButton = page
      .getByRole('button', { name: reasonRe })
      .or(page.getByRole('button').filter({ hasText: reasonRe }))
      .first();

    if (await desiredButton.count()) {
      await desiredButton.click({ timeout: 30_000 });
    } else {
      await reasonButtons.first().click({ timeout: 30_000 });
    }
  } else {
    await reasonButtons.first().click({ timeout: 30_000 });
  }

  return await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
}

// Universal UI helpers live in `uiActions.ts` (prompt + common CTAs).
export {
  clickCreateRequest,
  clickProceed,
  clickProceedWithRequest,
  enterPromptAndSubmit,
  getAskMeAnythingField,
} from './uiActions';


