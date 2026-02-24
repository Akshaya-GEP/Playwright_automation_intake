import { expect, type Page } from '@playwright/test';
import type { AgentContext } from './types';
import { waitForAiEvents } from './aiEvents';
import { finalizeRequestFlow } from './utils';
import type { SupplierOffboardingRow } from '../test-data/supplierOffboardingData';
import { selectOffboardingReason } from './supplierOffboardingActions';
import {
  clickCreateRequest,
  clickProceed,
  clickProceedIfPresent,
  clickProceedWithRequest,
  enterPromptAndSubmit,
  getAskMeAnythingField,
} from './uiActions';

/**
 * Agent 1.2: Supplier Offboarding (Workday variant)
 * Flow: Search -> Confirmation Message -> Proceed with Request -> Select Reason -> Create
 * Skips grid selection step - goes directly to confirmation after query
 */
export async function workflowAgent1_2(page: Page, _ctx: AgentContext, data: SupplierOffboardingRow) {
  const query = data.query;
  const targetReason = data.offboardReason || 'Not approved by TPRM';

  const askField = getAskMeAnythingField(page);
  let aiEventsCount: number | null = null;

  try {
    // --- Step 1: Initial Query ---
    console.log(`Starting Agent 1.2 Flow (Workday) with Query: ${query}`);
    aiEventsCount = await enterPromptAndSubmit(page, query, aiEventsCount);

    // Some environments require an explicit "Proceed" right after the initial query response.
    // Click it if present, but do not fail if it's not shown.
    const proceeded = await clickProceedIfPresent(page, 30_000).catch(() => false);
    if (proceeded) {
      aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
    }

    // --- Step 2: Supplier selection / confirmation ---
    // Workday often returns multiple suppliers in a grid. Other times it returns a direct confirmation card.
    console.log('Waiting for supplier grid or confirmation card...');

    const grid = page
      .getByRole('grid')
      .filter({ has: page.getByRole('columnheader', { name: /supplier name/i }) })
      .first()
      .or(page.getByRole('grid').first())
      .or(page.locator('[role="grid"]').first());

    const proceedWithRequest = page
      .getByRole('button', { name: /proceed with request/i })
      .or(page.getByRole('link', { name: /proceed with request/i }))
      .first();

    const confirmationMessage = page
      .getByText(/Thanks! I have found the supplier/i)
      .or(page.getByText(/Supplier Legal Name:/i))
      .or(page.getByText(/Supplier Partner Number:/i))
      .or(page.getByText(/would you like to go ahead with the offboarding request/i))
      .first();

    await Promise.race([
      grid.waitFor({ state: 'visible', timeout: 180_000 }).catch(() => { }),
      proceedWithRequest.waitFor({ state: 'visible', timeout: 180_000 }).catch(() => { }),
      confirmationMessage.waitFor({ state: 'visible', timeout: 180_000 }).catch(() => { }),
    ]);

    // Grid path: select first row checkbox and click Proceed
    if (await grid.isVisible().catch(() => false)) {
      const checkboxRows = grid
        .getByRole('row', { name: /press space to select this row/i })
        .or(grid.getByRole('row').filter({ has: grid.locator('input[type="checkbox"],[role="checkbox"]') }));

      await expect.poll(async () => await checkboxRows.count(), { timeout: 60_000 }).toBeGreaterThan(0);

      const firstCheckboxRow = checkboxRows.first();
      const checkboxInRow = firstCheckboxRow
        .getByRole('checkbox')
        .or(firstCheckboxRow.locator('input[type="checkbox"]'))
        .or(firstCheckboxRow.locator('[role="checkbox"]'))
        .first();

      await checkboxInRow
        .click({ force: true, timeout: 30_000 })
        .catch(async () => {
          await firstCheckboxRow.click({ force: true, timeout: 30_000 });
          await page.keyboard.press('Space').catch(() => { });
        });

      aiEventsCount = await clickProceed(page, aiEventsCount);
    }

    // Confirmation card path (or post-grid): click Proceed with Request if present.
    await proceedWithRequest.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => { });
    if (await proceedWithRequest.isVisible().catch(() => false)) {
      aiEventsCount = await clickProceedWithRequest(page, aiEventsCount);
    }

    // --- Step 4: Select Offboarding Reason ---
    // Wait for reason options to appear
    console.log("Waiting for reason options...");
    console.log(`Selecting reason: ${targetReason}`);
    aiEventsCount = await selectOffboardingReason(page, targetReason, aiEventsCount);

    // --- Step 5: Create Request ---
    console.log('Clicking Create Request button...');
    aiEventsCount = await clickCreateRequest(page, aiEventsCount);
    console.log('Create Request button clicked, waiting for final request screen...');
    await page.waitForTimeout(2000); // Wait for UI to update after Create Request

    // Standard end condition for all flows
    const end = await finalizeRequestFlow(page);
    console.log(`✅ Finalized flow. Ended by: ${end.endedBy}`);
    return end;

  } catch (error) {
    console.error("❌ Workflow failed!", error);
    throw error;
  } finally {
    // No inspection wait: keep tests within Playwright's per-test timeout.
  }
}

// getAskMeAnythingField moved to `supplierOffboardingActions.ts`

