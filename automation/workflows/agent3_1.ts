import { expect, type Locator, type Page } from '@playwright/test';
import { getEnv } from '../utils/env';
import type { AgentContext } from './types';
import { waitForAiEvents } from './aiEvents';
import { clickTerminationReason, normalizeTerminationStatus } from './terminationUtils';
import { finalizeRequestFlow } from './utils';

/**
 * Agent 3.1 workflow - Terminate Immediately
 * 
 * Same flow as Agent 3 but selects "Terminate Immediately" instead of
 * "Terminate for a future date", which skips the date selection step.
 */
export async function workflowAgent3_1(_page: Page, _ctx: AgentContext) {
  const page = _page;
  const env = getEnv();

  const askField = getPromptField(page);
  let aiEventsCount: number | null = null;

  try {
    // Start query
    console.log(`Starting Agent 3.1 Flow (Terminate Immediately) with Query: ${env.userQuery3}`);
    await expect(askField).toBeVisible({ timeout: 180_000 });
    await askField.click({ timeout: 30_000 }).catch(() => {});
    await askField.fill(env.userQuery3);
    await askField.press('Enter').catch(() => {});
    aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

    // Wait for summary text and proceed question
    // UI shows: "Would you like to go ahead with the termination request?" or "would you like to proceed with the termination request?"
    const summarySignal = page.getByText(/would you like to (go ahead|proceed) with the termination request\?/i);
    await expect(summarySignal.first()).toBeVisible({ timeout: 240_000 });

    // Use more specific selector to avoid matching other "Proceed" buttons
    const proceedWithRequest = page
      .getByRole('button', { name: /^proceed with request$/i })
      .or(page.getByRole('button', { name: /proceed\s+with\s+request/i }))
      .first();
    await expect(proceedWithRequest).toBeVisible({ timeout: 240_000 });
    try {
      await expect(proceedWithRequest).toBeEnabled({ timeout: 60_000 });
      await proceedWithRequest.click();
    } catch {
      // If button is not enabled, try clicking with force anyway (some UIs have disabled state issues)
      await proceedWithRequest.click({ force: true, timeout: 30_000 });
    }
    aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

    // Termination mode selection
    const modePrompt = page.getByText(
      /how would you like to proceed with the termination\?/i
    );
    await expect(modePrompt.first()).toBeVisible({ timeout: 240_000 });

    // Agent 3_1 uses TERMINATION_STATUS_3_1 (defaults to 'immediate' to skip date picker)
    const status = normalizeTerminationStatus(env.terminationStatus3_1) ?? 'immediate';
    if (status === 'future') {
      throw new Error(
        'TERMINATION_STATUS=future requires the date selection flow. Run Agent 3 workflow instead of Agent 3_1.'
      );
    }

    const terminateImmediately = page.getByRole('button', { name: /terminate immediately/i });
    await expect(terminateImmediately).toBeVisible({ timeout: 240_000 });
    await terminateImmediately.click();
    aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

    // Date selection step is SKIPPED for immediate termination
    // Proceed directly to termination reason

    // Termination reason: select option from env
    console.log('Waiting for termination reason prompt...');
    const reasonPrompt = page.getByText(/what is the reason for terminating this contract\?/i);
    await expect(reasonPrompt.first()).toBeVisible({ timeout: 240_000 });
    console.log('Termination reason prompt found');

    // Wait a bit for reason buttons to be fully rendered
    await page.waitForTimeout(2000);

    // Use REASON_TERMINATE_3_1 for agent3_1
    console.log(`Selecting termination reason: ${env.reasonTerminate3_1 || 'Termination for Cause - Service Related'}`);
    await clickTerminationReason(page, env.reasonTerminate3_1);
    aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

    // Wait for create request prompt and click Create Request
    const createPrompt = page.getByText(/would you like to create the project request with these details\?/i);
    await expect(createPrompt.first()).toBeVisible({ timeout: 240_000 });

    console.log('Clicking Create Request button...');
    const createRequest = page.getByRole('button', { name: /create request/i });
    await expect(createRequest).toBeVisible({ timeout: 240_000 });
    await expect(createRequest).toBeEnabled({ timeout: 240_000 });
    await createRequest.click();
    aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
    console.log('Create Request button clicked, waiting for Send for Validation button...');

    // Standard end condition for all flows
    await page.waitForTimeout(2000); // Wait for UI to update after Create Request
    const end = await finalizeRequestFlow(page);
    console.log(`✅ Finalized flow. Ended by: ${end.endedBy}`);
  } catch (error) {
    console.error("❌ Agent 3.1 workflow failed!", error);
    throw error;
  }
}

function getPromptField(page: Page): Locator {
  return page
    .getByRole('textbox', { name: /^prompt$/i })
    .or(page.getByRole('textbox', { name: /prompt|ask me anything/i }))
    .or(page.getByPlaceholder(/ask me anything/i));
}


