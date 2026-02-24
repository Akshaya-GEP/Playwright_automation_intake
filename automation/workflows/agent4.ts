import { expect, type Page } from '@playwright/test';
import type { AgentContext } from './types';
import { waitForAiEvents } from './aiEvents';
import { finalizeRequestFlow } from './utils';
import {
  clickCreateRequest,
  clickProceedWithRequest,
  enterPromptAndSubmit,
  clickYesForQuestion,
  clickProceedIfPresent,
  getCreateRequestControl,
} from './uiActions';
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

  aiEventsCount = await clickProceedWithRequest(page, aiEventsCount);

  // Step 3: Date Selection (from CSV)
  // Some builds don't show the literal prompt text; don't hard-block on copy.
  // `handleExtensionDateSelection` will wait for the actual "Extension Date" widget instead.
  page
    .getByText(/capture the contract extension date|extension date/i)
    .filter({ hasNot: page.locator('code') })
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 })
    .catch(() => {});

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
  const discussionQuestion = page
    .getByText(/have the proposed change\(s\) been discussed with the supplier|discussed with the supplier/i)
    .filter({ hasNot: page.locator('code') })
    .first();
  await expect(discussionQuestion).toBeVisible({ timeout: 180_000 });

  // Some builds render Yes/No buttons + a follow-up summary prompt; others accept a single text response.
  // Handle both:
  // - If Yes is clickable near the question, click it
  // - If a summary prompt appears, answer it
  // - Otherwise, send a combined answer in one shot
  const discussionSummary =
    (data.modificationDetails || '').trim() ||
    'Discussed the proposed changes with the supplier and aligned on the extension date and terms.';
  const combinedAnswer = `Yes, I have discussed. Summary: ${discussionSummary}`;

  const summaryPrompt = page
    .getByText(/provide a summary of the discussion|summary of the discussion/i)
    .filter({ hasNot: page.locator('code') })
    .first();

  let clickedYes = false;
  try {
    await clickYesForQuestion(page, discussionQuestion);
    clickedYes = true;
    aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
  } catch {
    // No Yes/No UI found (or not clickable): fall back to sending combined answer.
  }

  const needsSummary = await summaryPrompt
    .waitFor({ state: 'visible', timeout: 30_000 })
    .then(() => true)
    .catch(() => false);

  if (needsSummary) {
    aiEventsCount = await enterPromptAndSubmit(page, combinedAnswer, aiEventsCount);
  } else if (!clickedYes) {
    aiEventsCount = await enterPromptAndSubmit(page, combinedAnswer, aiEventsCount);
  }

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

  // Step 7: Create Request (some UIs skip directly to final CTAs; don't hard-block)
  const createRequest = getCreateRequestControl(page);
  const sendForValidation = page.getByRole('button', { name: /send (for )?validation/i }).first();
  const editProjectRequest = page.getByRole('button', { name: /edit project request/i }).first();
  const congratulations = page.getByText(/congratulations|congrats/i).first();

  const next = await Promise.race([
    createRequest.waitFor({ state: 'visible', timeout: 240_000 }).then(() => 'create'),
    sendForValidation.waitFor({ state: 'visible', timeout: 240_000 }).then(() => 'send'),
    editProjectRequest.waitFor({ state: 'visible', timeout: 240_000 }).then(() => 'edit'),
    congratulations.waitFor({ state: 'visible', timeout: 240_000 }).then(() => 'congrats'),
  ]).catch(() => null);

  if (next === 'create') {
    aiEventsCount = await clickCreateRequest(page, aiEventsCount);
  }

  // Step 8: Finalize (Send for validation when applicable) + Congrats/end screen
  return await finalizeRequestFlow(page, { endTimeoutMs: 360_000 });
}


