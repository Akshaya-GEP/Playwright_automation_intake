import { expect, type Locator, type Page } from '@playwright/test';
import { getEnv } from '../utils/env';
import type { AgentContext } from './types';
import { waitForAiEvents } from './aiEvents';
import { escapeRegex } from './utils';

/**
 * Agent 1.2: Supplier Offboarding (Workday variant)
 * Flow: Search -> Confirmation Message -> Proceed with Request -> Select Reason -> Create
 * Skips grid selection step - goes directly to confirmation after query
 */
export async function workflowAgent1_2(page: Page, _ctx: AgentContext) {
  const env = getEnv();
  
  // Data from Env - Workday specific variables
  const query = env.userQueryWorkday || "i want to offboard supplier workday";
  const targetReason = env.reasonOffboardWorkday || "Not approved by TPRM";

  const askField = getAskMeAnythingField(page);
  let aiEventsCount: number | null = null;

  try {
    // --- Step 1: Initial Query ---
    console.log(`Starting Agent 1.2 Flow (Workday) with Query: ${query}`);
    await expect(askField).toBeVisible({ timeout: 180_000 });
    await askField.fill(query);
    await askField.press('Enter').catch(() => {});
    aiEventsCount = await waitForAiEvents(page, aiEventsCount);

    // --- Step 2: Wait for Confirmation Message (SKIP GRID SELECTION) ---
    // After query, wait for the confirmation message with supplier details
    console.log("Waiting for supplier confirmation message...");
    
    // Wait for the confirmation message - look for key phrases that indicate the confirmation
    const confirmationMessage = page.getByText(/Thanks! I have found the supplier/i)
      .or(page.getByText(/Supplier Legal Name:/i))
      .or(page.getByText(/Supplier Partner Number:/i))
      .or(page.getByText(/would you like to go ahead with the offboarding request/i));
    
    await expect(confirmationMessage.first()).toBeVisible({ timeout: 120_000 });

    // Wait a bit for the message to fully render
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await page.waitForTimeout(1000);

    // --- Step 3: Click "Proceed with Request" ---
    const proceedWithRequest = page
      .getByRole('button', { name: /proceed with request/i })
      .or(page.getByRole('link', { name: /proceed with request/i }));
    
    await expect(proceedWithRequest.first()).toBeVisible({ timeout: 60_000 });
    await expect(proceedWithRequest.first()).toBeEnabled({ timeout: 60_000 });
    await proceedWithRequest.first().click({ timeout: 30_000 });
    aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

    // --- Step 4: Select Offboarding Reason ---
    // Wait for reason options to appear
    console.log("Waiting for reason options...");
    const reasonButtons = page
      .getByRole('button', {
        name: /no longer doing business|not approved by tprm|quick setup and pay/i
      })
      .or(page.getByRole('button').filter({ hasText: /no longer doing business|not approved by tprm|quick setup and pay/i }));

    await expect.poll(async () => await reasonButtons.count(), { timeout: 120_000 }).toBeGreaterThan(0);

    const reasonTextRaw = env.reasonOffboardWorkday?.trim();
    if (reasonTextRaw) {
      const reasonPattern = escapeRegex(reasonTextRaw).replace(/\\\s+/g, '\\s+');
      const reasonRe = new RegExp(reasonPattern, 'i');

      const desiredButton = page
        .getByRole('button', { name: reasonRe })
        .or(page.getByRole('button').filter({ hasText: reasonRe }))
        .first();

      if (await desiredButton.count()) {
        console.log(`Selecting reason: ${reasonTextRaw}`);
        await desiredButton.click({ timeout: 30_000 });
      } else {
        console.log("Desired reason not found, selecting first available reason");
        await reasonButtons.first().click({ timeout: 30_000 });
      }
    } else {
      console.log("No specific reason provided, selecting first available reason");
      await reasonButtons.first().click({ timeout: 30_000 });
    }
    aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

    // --- Step 5: Create Request ---
    console.log("Clicking Create Request...");
    const createRequest = page.getByRole('button', { name: /create request/i });
    await expect(createRequest).toBeEnabled({ timeout: 60_000 });
    await createRequest.click();
    aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

    // --- Step 6: Success Validation ---
    // 1. Success Message
    await expect(page.getByText(/Request created successfully/i).first()).toBeVisible({ timeout: 180_000 });

    // 2. PRQ Number Generation Check (PRQ-XXXXXX)
    await expect(page.getByText(/Request Number:\s*PRQ-/i)).toBeVisible();

    // 3. End of Flow Indicator ("Send for validation")
    const endFlowSignal = page.getByText(/Send for validation/i)
        .or(page.getByRole('button', { name: /send for validation/i }));
    await expect(endFlowSignal.first()).toBeVisible({ timeout: 60_000 });

    console.log("✅ Workflow completed successfully.");

  } catch (error) {
    console.error("❌ Workflow failed!", error);
    throw error;
  } finally {
    // --- FINAL WAIT: Stay in browser for 1 minute (only if page is still open) ---
    try {
      const isClosed = page.isClosed();
      if (!isClosed) {
        console.log("⏳ Keeping browser open for 60 seconds (inspection time)...");
        // eslint-disable-next-line playwright/no-wait-for-timeout
        await page.waitForTimeout(60000).catch(() => {
          console.log("Page closed during wait, exiting...");
        });
      } else {
        console.log("Page already closed, skipping wait...");
      }
    } catch (e) {
      console.log("Could not check page status, skipping wait...");
    }
  }
}

// --- Local Helper ---
function getAskMeAnythingField(page: Page): Locator {
  return page
    .getByRole('textbox', { name: /^prompt$/i })
    .or(page.getByRole('textbox', { name: /prompt|ask me anything/i }))
    .or(page.getByPlaceholder(/ask me anything/i))
    .or(page.getByLabel(/ask me anything/i));
}

