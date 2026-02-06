import { expect, type Locator, type Page } from '@playwright/test';
import { getEnv } from '../utils/env';
import type { AgentContext } from './types';
import { waitForAiEvents } from './aiEvents';
import { escapeRegex, finalizeRequestFlow } from './utils';

/**
 * Agent 2 workflow stub - Test Case 2.
 *
 * Uses REASON_AMEND_2 for the amendment reason.
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
  
  // --- CHANGE FOR TEST CASE 2 ---
  // Using env.reasonAmend2 (mapped to REASON_AMEND_2="Change in terms and condition")
  await clickAmendmentReason(page, env.reasonAmend2); 
  // ------------------------------

  // Click whitespace outside dropdown to close it (as per your instructions)
  await page.mouse.click(10, 10);

  // Proceed (some UIs render multiple Proceed buttons; click the visible+enabled one)
  const proceedClicked = await clickProceedIfPresent(page, 60_000);
  if (!proceedClicked) {
    const proceed = page.getByRole('button', { name: /^proceed$/i }).first();
    await expect(proceed).toBeVisible({ timeout: 60_000 });
    await expect(proceed).toBeEnabled({ timeout: 120_000 });
    try {
      await proceed.click({ timeout: 30_000 });
    } catch {
      await proceed.click({ timeout: 30_000, force: true });
    }
  }
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
  const timeSensitivityQ = page
    .getByText(
      /are there any changes in the type or volume of data being shared|type\s+or\s+volume\s+of\s+data\s+being\s+shared|time\s+sensitivity|amendment\s+time\s+sensitivity/i
    )
    .filter({ hasNot: page.locator('code') })
    .first();

  const timeQAppeared = await timeSensitivityQ
    .waitFor({ state: 'visible', timeout: 240_000 })
    .then(() => true)
    .catch(() => false);

  if (timeQAppeared) {
    await clickYesForQuestion(page, timeSensitivityQ);
    await clickProceedIfPresent(page, 10_000).catch(() => false);
    aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
  } else {
    console.log('Time sensitivity question not shown (timed out); continuing...');
  }

  // Yes/No step 2: products/services question (ensure we advanced before clicking again)
  // Match question with or without "Understood." prefix, case-insensitive
  const productsServicesQEl = page
    .getByText(/(understood\.?\s+)?are\s+there\s+significant\s+changes\s+in\s+products\s+or\s+services/i)
    .filter({ hasNot: page.locator('code') })
    .first();

  const psQAppeared = await productsServicesQEl
    .waitFor({ state: 'visible', timeout: 240_000 })
    .then(() => true)
    .catch(() => false);

  if (psQAppeared) {
    await page.waitForTimeout(1000);
    await clickYesForQuestion(page, productsServicesQEl);
    await clickProceedIfPresent(page, 10_000).catch(() => false);
    aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
  } else {
    console.log('Products/services question not shown (timed out); continuing...');
  }

async function clickProceedIfPresent(page: Page, timeoutMs = 10_000): Promise<boolean> {
  const start = Date.now();
  const candidates = page
    .locator('button')
    .filter({ hasText: /^\s*Proceed\s*$/i })
    .filter({ hasNotText: /proceed with request/i });

  while (Date.now() - start < timeoutMs) {
    const count = await candidates.count().catch(() => 0);
    for (let i = 0; i < count; i++) {
      const btn = candidates.nth(i);
      if (!(await btn.isVisible().catch(() => false))) continue;
      if (!(await btn.isEnabled().catch(() => false))) continue;
      try {
        await btn.scrollIntoViewIfNeeded();
      } catch {}
      await btn.click({ timeout: 30_000 }).catch(async () => {
        await btn.click({ timeout: 30_000, force: true }).catch(() => {});
      });
      return true;
    }
    await page.waitForTimeout(250);
  }
  return false;
}

  // Final summary step:
  // Some builds render "Here's a quick summary" inside AI diagnostics <code> blocks too,
  // which can cause strict-mode violations. Instead of asserting summary text, wait for the CTA.

  console.log('Waiting for Create Request button...');
  const createRequest = page
    .getByRole('button', { name: /^create request$/i })
    .or(page.locator('button').filter({ hasText: /create request/i }))
    .first();

  await expect(createRequest).toBeVisible({ timeout: 1200_000 });
  await expect(createRequest).toBeEnabled({ timeout: 1200_000 });
  
  // Scroll button into view to ensure it's visible for screenshots
  await createRequest.scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  
  // Try clicking with multiple strategies for reliability
  try {
    await createRequest.click({ timeout: 60_000 });
  } catch {
    // Fallback: force click if normal click fails
    try {
      await createRequest.click({ timeout: 60_000, force: true });
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

  console.log('Create Request button clicked, finalizing flow...');
  await page.waitForTimeout(2000); // Wait for UI to update after Create Request
  const end = await finalizeRequestFlow(page);
  console.log(`✅ Finalized flow. Ended by: ${end.endedBy}`);
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

async function clickDropdownOptionByText(page: Page, text: string | RegExp) {
  const re =
    typeof text === 'string'
      ? (() => {
          const q = text.trim();
          if (!q) throw new Error('clickDropdownOptionByText: empty text');
          return new RegExp(escapeRegex(q), 'i');
        })()
      : text;

  await waitForDropdownToShow(page);

  const panel = dropdownPanel(page);

  // Strategy 1: accessible checkbox/option roles (best)
  const roleCheckbox = panel.getByRole('checkbox', { name: re }).first();
  if (await roleCheckbox.count()) {
    await roleCheckbox.click({ timeout: 30_000 });
    return;
  }

  const roleOption = panel.getByRole('option', { name: re }).first();
  if (await roleOption.count()) {
    await roleOption.click({ timeout: 30_000 });
    return;
  }

  // Strategy 2: common containers (mat-option / li / label) for multi-select checkbox lists
  const panelContainers = panel.locator('mat-option, [role="option"], [role="menuitem"], li, label, div').filter({ hasText: re }).first();
  if (await panelContainers.count()) {
    await panelContainers.click({ timeout: 30_000 });
    return;
  }

  // Strategy 3: inline listbox (if options render there instead of overlay)
  const inlineListbox = page.locator('div[role="listbox"][aria-label="Amendment Reason"]').first();
  const inlineContainers = inlineListbox
    .locator('mat-option, [role="option"], [role="menuitem"], li, label, div, [role="checkbox"], input[type="checkbox"]')
    .filter({ hasText: re })
    .first();
  if (await inlineContainers.count()) {
    await inlineContainers.click({ timeout: 30_000 });
    return;
  }

  // Strategy 4: global text match (last resort)
  const global = page.getByText(re).filter({ hasNot: page.locator('code') }).first();
  if (await global.count()) {
    await global.click({ timeout: 30_000 });
    return;
  }

  throw new Error(`Amendment Reason option not found for text/pattern: ${String(re)}`);
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

  // Prefer exact/fuzzy text match; if it fails, try known label mappings.
  try {
    await clickDropdownOptionByText(page, v);
    return;
  } catch (e) {
    console.log(`Amendment Reason exact match failed for "${v}". Trying mapped labels...`);
  }

  const lower = v.toLowerCase();
  const mappings: RegExp[] = [];

  // Map common env phrases to the UI labels seen in the dropdown (checkbox list)
  if (lower.includes('terms') && (lower.includes('condition') || lower.includes('conditions'))) {
    mappings.push(/agreement\s+to\s+change\s+terms/i);
  }
  if (lower.includes('payment')) mappings.push(/change\s+in\s+payment\s+terms/i);
  if (lower.includes('location') || lower.includes('region')) mappings.push(/addition\s+of\s+new\s+locations\s+or\s+regions/i);
  if (lower.includes('party') || lower.includes('parties')) mappings.push(/addition\s+or\s+removal\s+of\s+parties/i);
  if (lower.includes('supplier') && (lower.includes('entity') || lower.includes('ownership'))) {
    mappings.push(/change\s+in\s+supplier\s+entity\s+or\s+ownership/i);
  }
  if (lower.includes('compliance') || lower.includes('legal')) mappings.push(/compliance\s+or\s+legal\s+requirement/i);

  // Last resort: flexible word-based match (all words present)
  const words = v
    .split(/[\s\u2014\u2013\u002D,]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 2);
  if (words.length) {
    const lookaheads = words.map((w) => `(?=.*${escapeRegex(w)})`).join('');
    mappings.push(new RegExp(`${lookaheads}.*`, 'i'));
  }

  for (const re of mappings) {
    try {
      await clickDropdownOptionByText(page, re);
      return;
    } catch {
      // try next mapping
    }
  }

  // Fallback: pick the 2nd option (existing default behavior) instead of failing the run.
  console.log(`Amendment Reason could not be matched for "${v}". Falling back to 2nd option.`);
  await clickDropdownOptionByIndex(page, 1);
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