import { expect, type Page } from '@playwright/test';
import type { AgentContext } from './types';
import { waitForAiEvents } from './aiEvents';
import { finalizeRequestFlow } from './utils';
import { enterPromptAndSubmit, clickYesForQuestion, clickProceedIfPresent } from './uiActions';
import {
  handleExtensionDateSelection,
  clickExtensionReason,
  selectModificationOptionSequence,
} from './contractextActions';
import type { ContractExtensionRow } from '../test-data/contractExtensionData';

/**
 * Agent 4: Contract Extension (CSV-driven)
 * - Uses `Contract Extension.csv` via `ContractExtensionRow`
 * - Sets the Extension Date via the shared datepicker helper (Material calendar / input fallback)
 */
export async function workflowAgent4(page: Page, _ctx: AgentContext, data: ContractExtensionRow) {
  console.log(`Starting Agent 4 Workflow for Sno: ${data.sno}`);
  let aiEventsCount: number | null = null;

  // Step 1: Trigger Flow
  aiEventsCount = await enterPromptAndSubmit(page, data.query, aiEventsCount);

  // Step 2: Contract Identification & Verification
  await expect(page.getByText(/I have found (the )?CDR/i)).toBeVisible({ timeout: 180_000 });
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  await expect(page.getByText(/Contract Number:/i).filter({ hasNot: page.locator('code') }).first()).toBeVisible();
  await expect(page.getByText(/Expiry Date:/i).filter({ hasNot: page.locator('code') }).first()).toBeVisible();

  const proceedWithRequestBtn = page.getByRole('button', { name: /proceed with request/i }).first();
  await expect(proceedWithRequestBtn).toBeVisible({ timeout: 60_000 });
  await proceedWithRequestBtn.click();
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // Step 3: Date Selection (from CSV)
  const datePrompt = page
    .getByText(/capture the contract extension date/i)
    .filter({ hasNot: page.locator('code') })
    .first();
  await expect(datePrompt).toBeVisible({ timeout: 180_000 });

  await handleExtensionDateSelection(page, data.extensionDate);
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // Step 4: Select Extension Reason
  const reasonPrompt = page
    .getByText(/select the reason for extension|reason for requesting.*extension|reason for extension/i)
    .filter({ hasNot: page.locator('code') })
    .first();
  await expect(reasonPrompt).toBeVisible({ timeout: 180_000 });

  await clickExtensionReason(page, data.reason);
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // Step 5: Contract Terms (Modifications)
  const contractTermsPrompt = page.getByText(/Contract Terms/i).filter({ hasNot: page.locator('code') }).first();
  await expect(contractTermsPrompt).toBeVisible({ timeout: 180_000 });

  await selectModificationOptionSequence(page, data.modifications, data.applicableOptions);
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // Step 6: Supplier Discussion (+ conditional follow-ups)
  const discussionPrompt = page.getByText(/discussed with the supplier/i).filter({ hasNot: page.locator('code') }).first();
  await expect(discussionPrompt).toBeVisible({ timeout: 180_000 });

  aiEventsCount = await enterPromptAndSubmit(page, 'yes, i have discussed', aiEventsCount);

  const questions = [
    page
      .getByText(/any changes in the type or volume of data being shared|type\s+or\s+volume\s+of\s+data\s+being\s+shared/i)
      .filter({ hasNot: page.locator('code') })
      .first(),
    page.getByText(/significant changes in products or services/i).filter({ hasNot: page.locator('code') }).first(),
  ];

  for (const q of questions) {
    const visible = await q
      .waitFor({ state: 'visible', timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
    if (visible) {
      await clickYesForQuestion(page, q);
      await clickProceedIfPresent(page, 15_000).catch(() => false);
      aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
    }
  }

  // Step 7+: Finalize (includes "Create Request" + send for validation when applicable)
  return await finalizeRequestFlow(page, { endTimeoutMs: 360_000 });
}


