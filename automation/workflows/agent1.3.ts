import { expect, type Locator, type Page } from '@playwright/test';
import { getEnv } from '../utils/env';
import type { AgentContext } from './types';
import { waitForAiEvents } from './aiEvents';
import { escapeRegex, finalizeRequestFlow } from './utils';

/**
 * Agent 1.3: Supplier Offboarding (by Identification / Partner Number)
 * Flow:
 * - Query supplier by identification number (from env)
 * - Proceed with Request
 * - Select Offboarding reason (from REASON_OFFBOARD)
 * - Create Request
 * - Validate final screen sections + buttons
 *
 * Note: This flow intentionally ENDS after Create Request (does not click Send for Validation).
 */
export async function workflowAgent1_3(page: Page, _ctx: AgentContext) {
  const env = getEnv();

  const query =
    env.userQuery1_3 || 'i want to offboard supplier with identification number GEP-000010742';
  const reasonFromEnv = env.reasonOffboard?.trim();

  const askField = getAskMeAnythingField(page);
  let aiEventsCount: number | null = null;

  try {
    // --- Step 1: Initial Query ---
    console.log(`Starting Agent 1.3 Flow with Query: ${query}`);
    await expect(askField).toBeVisible({ timeout: 180_000 });
    await askField.click({ timeout: 30_000 }).catch(() => {});
    await askField.fill(query);
    await askField.press('Enter').catch(() => {});
    aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

    // --- Step 2: Wait for Supplier Summary / Confirmation ---
    console.log('Waiting for supplier confirmation summary...');
    const confirmationSignal = page
      .getByText(/Thanks!\s*I have found the supplier in the system\./i)
      .or(page.getByText(/Supplier Legal Name:/i))
      .or(page.getByText(/Supplier Partner Number:/i))
      .or(page.getByText(/would you like to go ahead with the offboarding request\?/i))
      .or(page.getByText(/would you like to go ahead with the offboarding request/i));

    await expect(confirmationSignal.first()).toBeVisible({ timeout: 240_000 });

    // If SUPPLIER_CODE is present, assert it appears somewhere in the summary.
    if (env.supplierCode?.trim()) {
      const codeRe = new RegExp(escapeRegex(env.supplierCode.trim()), 'i');
      await expect(page.getByText(codeRe).first()).toBeVisible({ timeout: 60_000 });
    }

    // --- Step 3: Click "Proceed with Request" ---
    const proceedWithRequest = page
      .getByRole('button', { name: /^proceed with request$/i })
      .or(page.getByRole('button', { name: /proceed\s+with\s+request/i }))
      .first();

    await expect(proceedWithRequest).toBeVisible({ timeout: 240_000 });
    await expect(proceedWithRequest).toBeEnabled({ timeout: 120_000 });
    await proceedWithRequest.click({ timeout: 30_000 });
    aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

    // --- Step 4: Select Offboarding Reason ---
    console.log('Waiting for offboarding reason prompt/options...');
    const reasonPrompt = page
      .getByText(/what(?:'s| is) the primary reason for offboarding this supplier\?/i)
      .or(page.getByText(/primary reason for offboarding/i));

    await expect(reasonPrompt.first()).toBeVisible({ timeout: 240_000 });

    const reasonButtons = page
      .getByRole('button', {
        name: /no longer doing business|not approved by tprm|quick setup and pay/i
      })
      .or(
        page
          .getByRole('button')
          .filter({ hasText: /no longer doing business|not approved by tprm|quick setup and pay/i })
      );

    await expect.poll(async () => await reasonButtons.count(), { timeout: 120_000 }).toBeGreaterThan(0);

    if (reasonFromEnv) {
      const reasonPattern = escapeRegex(reasonFromEnv).replace(/\\\s+/g, '\\s+');
      const reasonRe = new RegExp(reasonPattern, 'i');
      const desiredReason = page
        .getByRole('button', { name: reasonRe })
        .or(page.getByRole('button').filter({ hasText: reasonRe }))
        .first();

      if (await desiredReason.count()) {
        console.log(`Selecting offboarding reason from env (REASON_OFFBOARD): ${reasonFromEnv}`);
        await desiredReason.click({ timeout: 30_000 });
      } else {
        console.log('Desired offboarding reason not found, selecting first available reason');
        await reasonButtons.first().click({ timeout: 30_000 });
      }
    } else {
      console.log('REASON_OFFBOARD not provided, selecting first available reason');
      await reasonButtons.first().click({ timeout: 30_000 });
    }
    aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

    // --- Step 5: Confirm + Create Request ---
    const createRequest = page.getByRole('button', { name: /create request/i }).first();
    await expect(createRequest).toBeVisible({ timeout: 240_000 });
    await expect(createRequest).toBeEnabled({ timeout: 240_000 });
    await createRequest.click({ timeout: 30_000 });
    aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

    // --- Step 6: Final Screen Assertions (END HERE) ---
    console.log('Validating final offboarding request screen...');

    // Sections
    await expect(page.getByText(/^Basic Details$/i).first()).toBeVisible({ timeout: 240_000 });
    await expect(page.getByText(/^Suppliers$/i).first()).toBeVisible({ timeout: 240_000 });
    await expect(page.getByText(/^Attachments$/i).first()).toBeVisible({ timeout: 240_000 });
    await expect(page.getByText(/^Team Members$/i).first()).toBeVisible({ timeout: 240_000 });

    // Standard end condition for all flows
    const end = await finalizeRequestFlow(page);
    console.log(`✅ Agent 1.3 finalized flow. Ended by: ${end.endedBy}`);
  } catch (error) {
    console.error('❌ Agent 1.3 workflow failed!', error);
    throw error;
  }
}

function getAskMeAnythingField(page: Page): Locator {
  return page
    .getByRole('textbox', { name: /^prompt$/i })
    .or(page.getByRole('textbox', { name: /prompt|ask me anything/i }))
    .or(page.getByPlaceholder(/ask me anything/i))
    .or(page.getByLabel(/ask me anything/i));
}


