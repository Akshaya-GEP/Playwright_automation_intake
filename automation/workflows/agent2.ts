import { expect, type Page } from '@playwright/test';
import type { AgentContext } from './types';
import { waitForAiEvents } from './aiEvents';
import { finalizeRequestFlow } from './utils';
import { clickCreateRequest, clickProceed, clickProceedWithRequest, enterPromptAndSubmit, getAskMeAnythingField, clickYesForQuestion, clickProceedIfPresent } from './uiActions';
import {
  getAmendmentReasonListbox,
  openAmendmentReasonDropdown,
  clickAmendmentReason
} from './contractamendActions';
import type { ContractAmendmentRow } from '../test-data/contractAmendmentData';

/**
 * Agent 2 workflow - Parameterized for BDD.
 */
export async function workflowAgent2(page: Page, ctx: AgentContext, data: ContractAmendmentRow) {
  console.log(`Starting Agent 2 Workflow for Sno: ${data.sno}`);
  const askField = getAskMeAnythingField(page);
  let aiEventsCount: number | null = null;

  // Start query
  aiEventsCount = await enterPromptAndSubmit(page, data.query, aiEventsCount);

  // Wait for "Proceed with Request"
  const proceedWithRequestBtn = page.getByRole('button', { name: /proceed with request/i }).or(page.getByText(/proceed with request/i)).first();
  console.log('Waiting for "Proceed with Request" button...');
  aiEventsCount = await clickProceedWithRequest(page, aiEventsCount);
  await expect(proceedWithRequestBtn).toBeHidden({ timeout: 30_000 }).catch(() => { });

  // Wait for discussion signal
  console.log('Waiting for assistant to ask about supplier discussion...');
  aiEventsCount = await waitForAiEvents(page, aiEventsCount, 90_000);
  const discussedSignal = page.getByText(/discuss(ed)?\s+with\s+the\s+supplier|supplier.*discuss/i).first();
  await discussedSignal.waitFor({ state: 'visible', timeout: 60_000 }).catch(() => { });

  // Use user's precise working confirmation text
  console.log('Confirming supplier discussion...');
  aiEventsCount = await enterPromptAndSubmit(page, 'Yes, I have discussed', aiEventsCount);

  // Amendment reason dropdown
  console.log('Handling Amendment Reason dropdown...');
  const amendmentReasonListbox = getAmendmentReasonListbox(page);
  await expect(amendmentReasonListbox).toBeVisible({ timeout: 180_000 });

  await openAmendmentReasonDropdown(page, amendmentReasonListbox);
  console.log(`Selecting reason: ${data.reasonAmend}`);
  await clickAmendmentReason(page, data.reasonAmend);

  // Close dropdown by clicking outside
  await page.mouse.click(10, 10);
  await page.waitForTimeout(1000);

  // Proceed
  console.log('Clicking Proceed...');
  const proceedClicked = await clickProceedIfPresent(page, 60_000);
  if (!proceedClicked) {
    aiEventsCount = await clickProceed(page, aiEventsCount);
  } else {
    aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
  }

  // Description step
  console.log('Providing amendment description...');
  const descriptionPrompt = page.getByText(/noted\.\s*please provide brief description/i).first();
  await descriptionPrompt.waitFor({ state: 'visible', timeout: 60_000 }).catch(() => { });
  aiEventsCount = await enterPromptAndSubmit(page, 'Description: this is final description', aiEventsCount);

  // Yes/No questions
  const questions = [
    page.getByText(/are there any changes in the type or volume of data being shared|type\s+or\s+volume\s+of\s+data\s+being\s+shared|time\s+sensitivity|amendment\s+time\s+sensitivity/i).filter({ hasNot: page.locator('code') }).first(),
    page.getByText(/(understood\.?\s+)?are\s+there\s+significant\s+changes\s+in\s+products\s+or\s+services/i).filter({ hasNot: page.locator('code') }).first()
  ];

  for (const q of questions) {
    const visible = await q.waitFor({ state: 'visible', timeout: 240_000 }).then(() => true).catch(() => false);
    if (visible) {
      console.log('Answering Yes/No question...');
      await page.waitForTimeout(1000);
      await clickYesForQuestion(page, q);
      await clickProceedIfPresent(page, 15_000).catch(() => false);
      aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
    }
  }

  // Final summary
  const finalSummary = page.getByText(/ quick summary:/i).first();
  const finalConfirm = page.getByText(/Please confirm if the above details are correct/i).first();
  await expect(finalSummary.or(finalConfirm).first()).toBeVisible({ timeout: 1200_000 });

  console.log('Clicking Create Request button...');
  aiEventsCount = await clickCreateRequest(page, aiEventsCount);
  await page.waitForTimeout(2000);
  return await finalizeRequestFlow(page);
}
