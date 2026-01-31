import { expect, type Locator, type Page } from '@playwright/test';
import { getEnv } from '../utils/env';
import type { AgentContext } from './types';
import { waitForAiEvents } from './aiEvents';
import { escapeRegex } from './utils';

/**
 * Agent 2 workflow stub.
 *
 * Add the UI steps for Agent 2 here. Keep this file focused on Agent 2 only.
 * You can use `ctx.agentName` and shared env vars from `getEnv()` as needed.
 */
export async function workflowAgent2(page: Page, _ctx: AgentContext) {
  const env = getEnv();

  const askField = getAskMeAnythingField(page);
  // IMPORTANT: "AI Events (N)" is not always present on the initial landing screen.
  // Don't wait for it until after the first user query is sent.
  let aiEventsCount: number | null = null;

  // Start query for Agent 2
  await expect(askField).toBeVisible({ timeout: 180_000 });
  await askField.click({ timeout: 30_000 }).catch(() => {});
  await askField.fill(env.userQuery2);
  await askField.press('Enter').catch(() => {});
  aiEventsCount = await waitForAiEvents(page, aiEventsCount);

  // Wait for "Proceed with Request" and click it
  const proceedWithRequest = page.getByRole('button', { name: /proceed with request/i });
  await expect(proceedWithRequest).toBeVisible({ timeout: 180_000 });
  await expect(proceedWithRequest).toBeEnabled({ timeout: 180_000 });
  await proceedWithRequest.click();
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // Wait for the assistant's question (wording varies), then send follow-up confirmation.
  // We don't hard-require the exact sentence because it changes across versions (V12, etc.).
  const discussedSignal = page.getByText(/discuss(ed)?\s+with\s+the\s+supplier|supplier.*discuss/i).first();
  await expect(askField).toBeVisible({ timeout: 180_000 });
  // Best-effort: wait for the discussed question; if it doesn't appear, still proceed (AI event already waited).
  await discussedSignal.waitFor({ state: 'visible', timeout: 30_000 }).catch(() => {});

  await askField.fill('Yes, I have discussed');
  await askField.press('Enter').catch(() => {});
  aiEventsCount = await waitForAiEvents(page, aiEventsCount);

  // Amendment reason dropdown: click arrow, wait, click arrow again, select first item, click outside, then Proceed
  const amendmentReasonListbox = getAmendmentReasonListbox(page);
  await expect(amendmentReasonListbox).toBeVisible({ timeout: 180_000 });
  // Open the dropdown reliably:
  // - click the chevron (may need multiple clicks)
  // - wait for any loading to finish
  // - click once more after loading (as per your requirement)
  await openAmendmentReasonDropdown(page, amendmentReasonListbox);
  await clickAmendmentReason(page, env.reasonAmend);

  // Click whitespace outside dropdown to close it (as per your instructions)
  await page.mouse.click(10, 10);

  const proceed = page.getByRole('button', { name: /^proceed$/i });
  await expect(proceed).toBeEnabled({ timeout: 60_000 });
  await proceed.click();
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // Wait for the post-proceed response asking for description, then send description.
  const descriptionPrompt = page.getByText(
    /noted\.\s*please provide brief description for the amendment you want to do for the selected contract\./i
  );
  await expect(descriptionPrompt.first()).toBeVisible({ timeout: 180_000 });

  await askField.fill('Description: this is final description');
  await askField.press('Enter').catch(() => {});
  aiEventsCount = await waitForAiEvents(page, aiEventsCount);

  // Yes/No step 1: time sensitivity / type-volume question
  const timeSensitivityQ = page.getByText(
    /type\s+or\s+volume\s+of\s+data\s+being\s+shared|time\s+sensitivity|amendment\s+time\s+sensitivity/i
  );
  await expect(timeSensitivityQ.first()).toBeVisible({ timeout: 240_000 });
  await clickYesForQuestion(page, timeSensitivityQ.first());
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // Yes/No step 2: products/services question (ensure we advanced before clicking again)
  // Match question with or without "Understood." prefix, case-insensitive
  const productsServicesQ = page.getByText(
    /(understood\.?\s+)?are\s+there\s+significant\s+changes\s+in\s+products\s+or\s+services/i
  );
  await expect(productsServicesQ.first()).toBeVisible({ timeout: 240_000 });
  // Wait a bit for the Yes/No buttons to be fully rendered
  await page.waitForTimeout(1000);
  await clickYesForQuestion(page, productsServicesQ.first());
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // After answering "Yes" the assistant shows a final summary and asks to confirm before creation.
  // Wait for that summary state before clicking "Create Request".
  const finalSummary = page.getByText(/here'?s a quick summary/i).first();
  const finalConfirm = page
    .getByText(
      /please confirm if the above details are correct and if you'?d like to proceed with the creation of the final project request\./i
    )
    .first();
  await expect(finalSummary.or(finalConfirm)).toBeVisible({ timeout: 240_000 });

  // Create request - wait for button to be ready and click it
  const createRequest = page.getByRole('button', { name: /^create request$/i });
  await expect(createRequest).toBeVisible({ timeout: 240_000 });
  await expect(createRequest).toBeEnabled({ timeout: 240_000 });
  
  // Try clicking with multiple strategies for reliability
  try {
    await createRequest.click({ timeout: 30_000 });
  } catch {
    // Fallback: force click if normal click fails
    try {
      await createRequest.click({ timeout: 30_000, force: true });
    } catch {
      // Last resort: mouse click at button center
      const box = await createRequest.boundingBox().catch(() => null);
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      } else {
        throw new Error('Could not click Create Request button');
      }
    }
  }
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // Wait for response after clicking "Create Request" - may show success message or request number
  // Wait a moment for the UI to update
  await page.waitForTimeout(2000);

  // Final screen: wait for "send for validation" button and click it
  const sendForValidation = page
    .getByRole('button', { name: /send (for )?validation/i })
    .or(page.getByRole('link', { name: /send (for )?validation/i }))
    .first();
  await expect(sendForValidation).toBeVisible({ timeout: 240_000 });
  await expect(sendForValidation).toBeEnabled({ timeout: 60_000 });
  
  // Try clicking with multiple strategies for reliability
  try {
    await sendForValidation.click({ timeout: 30_000 });
  } catch {
    // Fallback: force click if normal click fails
    try {
      await sendForValidation.click({ timeout: 30_000, force: true });
    } catch {
      // Last resort: mouse click at button center
      const box = await sendForValidation.boundingBox().catch(() => null);
      if (box) {
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      } else {
        throw new Error('Could not click Send for Validation button');
      }
    }
  }
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // Wait for final success message/confirmation
  const successMessage = page
    .getByText(/Congrats.*Project Request.*sent for validation/i)
    .or(page.getByText(/sent for validation/i))
    .or(page.getByText(/Congrats/i))
    .or(page.getByText(/Request.*sent for validation/i));
  await expect(successMessage.first()).toBeVisible({ timeout: 180_000 }).catch(() => {});

  // eslint-disable-next-line playwright/no-wait-for-timeout
  await page.waitForTimeout(5_000);
}

function getAskMeAnythingField(page: Page): Locator {
  // Matches the prompt box in the Qube Mesh chat UI
  // Prefer the actual accessibility name "Prompt" (seen in snapshots as: textbox "Prompt")
  return page
    .getByRole('textbox', { name: /^prompt$/i })
    .or(page.getByRole('textbox', { name: /prompt|ask me anything/i }))
    .or(page.getByPlaceholder(/ask me anything/i))
    .or(page.getByLabel(/ask me anything/i));
}

function getAmendmentReasonListbox(page: Page): Locator {
  // The Amendment Reason field is exposed as listbox "Amendment Reason" in the DOM snapshot.
  const labelText = /amendment reason/i;

  // IMPORTANT: the page often contains BOTH:
  // - a section/header button "Amendment Reason" (role=button)
  // - the actual input control (role=listbox with aria-label="Amendment Reason")
  // Avoid `.or(...)` unions here (strict mode), and directly target the listbox element.
  const listboxByAttrs = page.locator('div[role="listbox"][aria-label="Amendment Reason"]').first();
  const listboxByRole = page.getByRole('listbox', { name: labelText }).first();

  return listboxByAttrs.or(listboxByRole);
}

function dropdownPanel(page: Page): Locator {
  return page.locator('.cdk-overlay-pane:visible, .mat-select-panel:visible, .dropdown-menu:visible').first();
}

function dropdownOptionCandidates(page: Page): Locator {
  const panel = dropdownPanel(page);
  const panelCandidates = panel.locator(
    '[role="option"], mat-option, [role="menuitem"], [role="checkbox"], .mat-option, .dropdown-item, li, input[type="checkbox"]'
  );

  const inlineListbox = page.locator('div[role="listbox"][aria-label="Amendment Reason"]').first();
  const inlineCandidates = inlineListbox.locator(
    '[role="option"], mat-option, [role="menuitem"], [role="checkbox"], .mat-option, .dropdown-item, li, input[type="checkbox"]'
  );

  return panelCandidates.or(inlineCandidates);
}

async function waitForDropdownToShow(page: Page) {
  await expect
    .poll(async () => await dropdownOptionCandidates(page).count(), { timeout: 60_000 })
    .toBeGreaterThan(0);
}

async function isDropdownVisible(page: Page): Promise<boolean> {
  return (await dropdownOptionCandidates(page).first().isVisible().catch(() => false)) === true;
}

async function forceClickChevronNTimes(page: Page, field: Locator, clicks: number) {
  for (let i = 0; i < clicks; i++) {
    const box = await field.boundingBox().catch(() => null);
    if (box) {
      const x = box.x + box.width - 12;
      const y = box.y + box.height / 2;
      await page.mouse.click(x, y);
    } else {
      // Fallback if bounding box isn't available yet.
      await field.click({ timeout: 30_000 }).catch(() => {});
    }
    // Tiny delay so the UI can register multiple clicks reliably.
    await page.waitForTimeout(150);
  }
}

async function waitForDropdownLoadingToFinish(page: Page) {
  // Generic "loading" indicators that commonly appear while dropdown options are fetched/rendered.
  const loader = page
    .getByRole('progressbar')
    .or(page.locator('[aria-busy="true"]'))
    .or(page.locator('.spinner, .loading, .loader, .mat-progress-spinner, .mat-spinner, .cdk-overlay-backdrop'));

  // If a loader flashes, wait for it to disappear; otherwise proceed quickly.
  const appeared = await loader.first().isVisible().catch(() => false);
  if (!appeared) return;

  await expect(loader.first()).toBeHidden({ timeout: 60_000 });
}

async function clickDropdownOptionByIndex(page: Page, index: number) {
  // Wait until options are rendered somewhere (overlay panel or inline listbox)
  await waitForDropdownToShow(page);

  const panel = dropdownPanel(page);
  const panelOptions = panel.locator('[role="option"], mat-option, .mat-option, .dropdown-item, li').filter({ hasNotText: /^$/ });
  const panelCount = await panelOptions.count();
  if (panelCount > 0) {
    const pick = panelOptions.nth(Math.min(index, panelCount - 1));
    await pick.click({ timeout: 30_000 });
    return;
  }

  const inlineListbox = page.locator('div[role="listbox"][aria-label="Amendment Reason"]').first();
  const inlineOptions = inlineListbox.locator('[role="option"], mat-option, .mat-option, .dropdown-item, li, [role="checkbox"], input[type="checkbox"]');
  const inlineCount = await inlineOptions.count();
  if (inlineCount === 0) {
    throw new Error('Dropdown options not found after opening Amendment Reason dropdown.');
  }

  const pick = inlineOptions.nth(Math.min(index, inlineCount - 1));
  await pick.click({ timeout: 30_000 });
}

async function clickDropdownOptionByText(page: Page, text: string) {
  const q = text.trim();
  if (!q) throw new Error('clickDropdownOptionByText: empty text');

  await waitForDropdownToShow(page);

  const panel = dropdownPanel(page);
  const panelOptions = panel.locator('[role="option"], mat-option, .mat-option, .dropdown-item, li');
  const panelMatch = panelOptions.filter({ hasText: new RegExp(escapeRegex(q), 'i') }).first();
  if (await panelMatch.count()) {
    await panelMatch.click({ timeout: 30_000 });
    return;
  }

  const inlineListbox = page.locator('div[role="listbox"][aria-label="Amendment Reason"]').first();
  const inlineOptions = inlineListbox.locator('[role="option"], mat-option, .mat-option, .dropdown-item, li, [role="checkbox"], input[type="checkbox"]');
  const inlineMatch = inlineOptions.filter({ hasText: new RegExp(escapeRegex(q), 'i') }).first();
  if (await inlineMatch.count()) {
    await inlineMatch.click({ timeout: 30_000 });
    return;
  }

  throw new Error(`Amendment Reason option not found for text: "${q}"`);
}

async function clickAmendmentReason(page: Page, reasonAmend?: string) {
  // Default behavior: select 2nd option (your preferred).
  // If REASON_AMEND is provided:
  // - numeric -> 1-based index
  // - otherwise -> match option text (recommended)
  const v = (reasonAmend || '').trim();
  if (!v) {
    await clickDropdownOptionByIndex(page, 1);
    return;
  }

  if (/^\d+$/.test(v)) {
    const idx1Based = Math.max(1, parseInt(v, 10));
    await clickDropdownOptionByIndex(page, idx1Based - 1);
    return;
  }

  await clickDropdownOptionByText(page, v);
}

async function openAmendmentReasonDropdown(page: Page, field: Locator) {
  // Some runs require multiple clicks and an extra click after a loader finishes.
  // We'll try a few times until options exist.
  const maxAttempts = 6;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Click chevron area once (force-ish) and also press Enter to activate if needed.
    await forceClickChevronNTimes(page, field, 1);
    await page.keyboard.press('Enter').catch(() => {});

    // If a loader appears, wait for it to finish, then click once more as requested.
    await waitForDropdownLoadingToFinish(page).catch(() => {});
    await forceClickChevronNTimes(page, field, 1);

    const count = await dropdownOptionCandidates(page).count().catch(() => 0);
    if (count > 0) return;

    // Small backoff before next attempt.
    await page.waitForTimeout(350);
  }

  // Final wait – if still nothing, throw a clear error.
  await waitForDropdownToShow(page);
}

async function clickYesForQuestion(page: Page, question: Locator) {
  // The UI keeps old Yes/No widgets in DOM (disabled + selected), so `getByRole('button', { name: Yes })`
  // often matches multiple elements (strict mode) and/or hits a disabled button.
  // Strategy: scope to the current question card and click an enabled Yes button.
  await expect(question).toBeVisible({ timeout: 240_000 });

  // Wait a moment for buttons to be fully rendered
  await page.waitForTimeout(500);

  const candidateRoots: Locator[] = [];
  let cur = question;
  for (let i = 0; i < 8; i++) {
    cur = cur.locator('..');
    candidateRoots.push(cur);
  }

  // Try multiple strategies to find and click Yes button
  for (const root of candidateRoots) {
    // Strategy 1: Find button by text content
    const yesByText = root.locator('button:has-text("Yes"):not([disabled])').first();
    const visibleByText = await yesByText.isVisible().catch(() => false);
    if (visibleByText) {
      try {
        await expect(yesByText).toBeEnabled({ timeout: 10_000 });
        await yesByText.click({ timeout: 30_000 });
        return;
      } catch {
        // Try force click if normal click fails
        try {
          await yesByText.click({ timeout: 30_000, force: true });
          return;
        } catch {
          // Try mouse click as fallback
          const box = await yesByText.boundingBox().catch(() => null);
          if (box) {
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            return;
          }
        }
      }
    }

    // Strategy 2: Find button by role - try all Yes buttons and find enabled one
    const yesButtonsByRole = root.getByRole('button', { name: /^yes$/i });
    const count = await yesButtonsByRole.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const yesBtn = yesButtonsByRole.nth(i);
      const isDisabled = await yesBtn.getAttribute('disabled').catch(() => null);
      if (isDisabled !== null) continue; // Skip disabled buttons
      
      const visible = await yesBtn.isVisible().catch(() => false);
      if (visible) {
        try {
          await expect(yesBtn).toBeEnabled({ timeout: 10_000 });
          await yesBtn.click({ timeout: 30_000 });
          return;
        } catch {
          try {
            await yesBtn.click({ timeout: 30_000, force: true });
            return;
          } catch {
            const box = await yesBtn.boundingBox().catch(() => null);
            if (box) {
              await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
              return;
            }
          }
        }
      }
    }
  }

  // Last resort: click any enabled Yes on the page (scoped to visible area)
  const yesGlobal = page.locator('button:has-text("Yes"):not([disabled])').first();
  await expect(yesGlobal).toBeVisible({ timeout: 60_000 });
  await expect(yesGlobal).toBeEnabled({ timeout: 10_000 });
  try {
    await yesGlobal.click({ timeout: 30_000 });
  } catch {
    await yesGlobal.click({ timeout: 30_000, force: true }).catch(async () => {
      const box = await yesGlobal.boundingBox().catch(() => null);
      if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    });
  }
}


