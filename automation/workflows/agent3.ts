import { expect, type Page } from '@playwright/test';
import type { AgentContext } from './types';
import { waitForAiEvents } from './aiEvents';
import {
  clickTerminationReason,
  normalizeTerminationStatus,
  handleTerminationDateSelection
} from './contracttermActions';
import { finalizeRequestFlow } from './utils';
import { enterPromptAndSubmit, clickProceedWithRequest, clickCreateRequest } from './uiActions';
import { getContractTerminationRow, type ContractTerminationRow } from '../test-data/contractTerminationData';

export async function workflowAgent3(page: Page, ctx: AgentContext, data: ContractTerminationRow) {
  console.log(`Starting Agent 3 Workflow for Sno: ${data.sno}`);
  let aiEventsCount: number | null = null;

  // Start query
  aiEventsCount = await enterPromptAndSubmit(page, data.query, aiEventsCount);

  // Wait for "Proceed with Request"
  aiEventsCount = await clickProceedWithRequest(page, aiEventsCount);

  // Termination mode selection
  const modePrompt = page.getByText(/how would you like to proceed with the termination\?/i);
  await expect(modePrompt.first()).toBeVisible({ timeout: 240_000 });

  const status = normalizeTerminationStatus(data.terminationStatus) ?? 'future';
  if (status === 'immediate') {
    const terminateImmediately = page.getByRole('button', { name: /terminate immediately/i });
    await terminateImmediately.click();
  } else {
    const futureDate = page.getByRole('button', { name: /terminate for a future date/i });
    await futureDate.click();
    aiEventsCount = await waitForAiEvents(page, aiEventsCount);

    // Date selection
    await handleTerminationDateSelection(page, data.terminationDate);
  }
  aiEventsCount = await waitForAiEvents(page, aiEventsCount);

  // Termination reason
  const reasonPrompt = page.getByText(/what is the reason for terminating this contract\?/i);
  await expect(reasonPrompt.first()).toBeVisible({ timeout: 240_000 });

  await clickTerminationReason(page, data.reasonTerminate);
  aiEventsCount = await waitForAiEvents(page, aiEventsCount);

  // Create Request
  aiEventsCount = await clickCreateRequest(page, aiEventsCount);

  // Finalize
  return await finalizeRequestFlow(page);
}
