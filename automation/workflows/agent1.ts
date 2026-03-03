import { expect, type Page } from '@playwright/test';
import type { AgentContext } from './types';
import { waitForAiEvents } from './aiEvents';
import { finalizeRequestFlow } from './utils';
import type { SupplierOffboardingRow } from '../test-data/supplierOffboardingData';
import {
  selectOffboardingReason,
} from './supplierOffboardingActions';
import { clickCreateRequest, clickProceed, clickProceedWithRequest, enterPromptAndSubmit, getAskMeAnythingField } from './uiActions';

/**
 * Agent 1: Supplier Offboarding
 * Flow: Search -> Select First Supplier from Grid -> Select Reason -> Create
 */
export async function workflowAgent1(page: Page, _ctx: AgentContext, data: SupplierOffboardingRow) {
  const query = data.query;
  const targetReason = data.offboardReason || 'Not approved by TPRM';

  const askField = getAskMeAnythingField(page);
  let aiEventsCount: number | null = null;

  try {
    // --- Step 1: Initial Query ---
    console.log(`Starting Agent 1 Flow with Query: ${query}`);
    aiEventsCount = await enterPromptAndSubmit(page, query, aiEventsCount);

    // --- Step 2: Grid Selection ---
    // Grid of suppliers: select the first checkbox shown, then click Proceed.
    // There can be multiple grids on the page; target the supplier grid by its headers.
    const grid = page
      .getByRole('grid')
      .filter({ has: page.getByRole('columnheader', { name: /supplier name/i }) })
      .first()
      .or(page.getByRole('grid').first())
      .or(page.locator('[role="grid"]').first());
    await expect(grid).toBeVisible({ timeout: 60_000 });

    // Select the first row checkbox (UI often labels these rows "Press SPACE to select this row").
    const checkboxRows = grid
      .getByRole('row', { name: /press space to select this row/i })
      .or(grid.getByRole('row').filter({ has: grid.locator('input[type="checkbox"],[role="checkbox"]') }));

    await expect.poll(async () => await checkboxRows.count(), { timeout: 60_000 }).toBeGreaterThan(0);

    const proceed = page.getByRole('button', { name: /^proceed$/i });

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
        await page.keyboard.press('Space').catch(() => {});
      });

    aiEventsCount = await clickProceed(page, aiEventsCount);

    // --- Step 3: Verification & Proceed ---
    // After "Proceed", some flows show a "Proceed with request" confirmation. Others go directly to reason options.
    const proceedWithRequest = page
      .getByRole('button', { name: /proceed with request/i })
      .or(page.getByRole('link', { name: /proceed with request/i }));
    const allRadios = page.getByRole('radio');

    await Promise.race([
      proceedWithRequest.first().waitFor({ state: 'visible', timeout: 120_000 }).catch(() => {}),
      allRadios.first().waitFor({ state: 'visible', timeout: 120_000 }).catch(() => {})
    ]);

    if (await proceedWithRequest.first().isVisible().catch(() => false)) {
      aiEventsCount = await clickProceedWithRequest(page, aiEventsCount);
    }

    // --- Step 4: Select Offboarding Reason ---
    aiEventsCount = await selectOffboardingReason(page, targetReason, aiEventsCount);

    // --- Step 5: Create Request ---
    // Next: click "create request"
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