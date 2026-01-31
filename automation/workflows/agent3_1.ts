import { expect, type Locator, type Page } from '@playwright/test';
import { getEnv } from '../utils/env';
import type { AgentContext } from './types';
import { waitForAiEvents } from './aiEvents';
import { clickTerminationReason, normalizeTerminationStatus } from './terminationUtils';

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

  // Start query
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

  // Termination reason: select first option
  const reasonPrompt = page.getByText(/what is the reason for terminating this contract\?/i);
  await expect(reasonPrompt.first()).toBeVisible({ timeout: 240_000 });

  // Use REASON_TERMINATE_3_1 for agent3_1
  await clickTerminationReason(page, env.reasonTerminate3_1);
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // Wait for create request prompt and click Create Request
  const createPrompt = page.getByText(/would you like to create the project request with these details\?/i);
  await expect(createPrompt.first()).toBeVisible({ timeout: 240_000 });

  const createRequest = page.getByRole('button', { name: /create request/i });
  await expect(createRequest).toBeVisible({ timeout: 240_000 });
  await expect(createRequest).toBeEnabled({ timeout: 240_000 });
  await createRequest.click();
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // Final: wait for send for validation / send validation button and click it
  const sendValidation = page.getByRole('button', { name: /send (for )?validation/i });
  await expect(sendValidation).toBeVisible({ timeout: 240_000 });
  await expect(sendValidation).toBeEnabled({ timeout: 60_000 });
  await sendValidation.click();
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // Wait for final success message
  const successMessage = page.getByText(/Congrats.*Project Request.*sent for validation/i)
    .or(page.getByText(/sent for validation/i))
    .or(page.getByText(/Congrats/i));
  await expect(successMessage.first()).toBeVisible({ timeout: 180_000 });
}

function getPromptField(page: Page): Locator {
  return page
    .getByRole('textbox', { name: /^prompt$/i })
    .or(page.getByRole('textbox', { name: /prompt|ask me anything/i }))
    .or(page.getByPlaceholder(/ask me anything/i));
}


