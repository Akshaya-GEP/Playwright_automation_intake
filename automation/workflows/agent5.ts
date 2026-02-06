import { expect, type Locator, type Page } from '@playwright/test';
import { getEnv } from '../utils/env';
import type { AgentContext } from './types';
import { waitForAiEvents } from './aiEvents';
import { escapeRegex, finalizeRequestFlow } from './utils';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

async function clickFirstEnabled(
  page: Page,
  candidates: { name: string; locator: Locator }[],
  opts?: { timeoutMs?: number; pollMs?: number },
) {
  const timeoutMs = opts?.timeoutMs ?? 60_000;
  const pollMs = opts?.pollMs ?? 250;
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    for (const c of candidates) {
      const isVisible = await c.locator.isVisible().catch(() => false);
      if (!isVisible) continue;

      const isEnabled = await c.locator.isEnabled().catch(() => false);
      if (!isEnabled) continue;

      await c.locator.click({ timeout: 30_000 });
      return c.name;
    }

    await page.waitForTimeout(pollMs);
  }

  return null;
}

/**
 * Agent 5: Supplier Profile Update Assistant
 * Flow: Supplier Selection -> Update Type Selection -> Detail Input -> Document Upload -> Create Request -> Send for Validation
 */
export async function workflowAgent5(page: Page, _ctx: AgentContext) {
  const env = getEnv();

  // Load environment variables with defaults
  const query = env.userQuery5 || 'I want to update supplier name Microsoft';
  const supplierName = env.supplierName5 || 'Microsoft';
  const supplierCode = env.supplierCode5 || 'GEP-000010742';
  const updateType = env.updateType5 || 'Exception Approval Required';
  const reasonAction = env.reasonAction5 || 'Approve supplier';
  const uploadFile = env.uploadFile5;

  const askField = getAskMeAnythingField(page);
  let aiEventsCount: number | null = null;

  // Step 1: Supplier Selection (same as Agent 1)
  console.log(`Starting Agent 5 Flow with Query: ${query}`);
  await expect(askField).toBeVisible({ timeout: 180_000 });
  await askField.fill(query);
  await askField.press('Enter').catch(() => {});
  aiEventsCount = await waitForAiEvents(page, aiEventsCount);

  // Grid Selection - same pattern as Agent 1
  // Grid of suppliers: select the first checkbox shown, then click Proceed.
  // There can be multiple grids on the page; target the supplier grid by its headers.
  const grid = page
    .getByRole('grid')
    .filter({ has: page.getByRole('columnheader', { name: /supplier name/i }) })
    .first()
    .or(page.getByRole('grid').first())
    .or(page.locator('[role="grid"]').first());
  await expect(grid).toBeVisible({ timeout: 60_000 });

  // Select the first row checkbox (UI often labels these rows "Press SPACE to select this row").
  const checkboxRows = grid
    .getByRole('row', { name: /press space to select this row/i })
    .or(grid.getByRole('row').filter({ has: grid.locator('input[type="checkbox"],[role="checkbox"]') }));

  await expect.poll(async () => await checkboxRows.count(), { timeout: 60_000 }).toBeGreaterThan(0);

  // FIX FOR STEP 1: Explicitly target the FIRST "Proceed" button associated with the grid
  const proceed = page.getByRole('button', { name: /^proceed$/i }).first();

  // Try to find supplier by name and code if provided, otherwise use first row
  let supplierSelected = false;
  if (supplierName && supplierCode) {
    // Look for row containing both supplier name and code
    const supplierRow = checkboxRows.filter({ 
      hasText: new RegExp(escapeRegex(supplierName), 'i') 
    }).filter({ 
      hasText: new RegExp(escapeRegex(supplierCode), 'i') 
    }).first();

    const rowCount = await supplierRow.count();
    if (rowCount > 0) {
      const checkboxInRow = supplierRow
        .getByRole('checkbox')
        .or(supplierRow.locator('input[type="checkbox"]'))
        .or(supplierRow.locator('[role="checkbox"]'))
        .first();
      await checkboxInRow
        .click({ force: true, timeout: 30_000 })
        .catch(async () => {
          await supplierRow.click({ force: true, timeout: 30_000 });
          await page.keyboard.press('Space').catch(() => {});
        });
      supplierSelected = true;
    }
  }

  // Fallback: select first row if specific supplier not found (same as Agent 1)
  if (!supplierSelected) {
    const firstCheckboxRow = checkboxRows.first();
    const checkboxInRow = firstCheckboxRow
      .getByRole('checkbox')
      .or(firstCheckboxRow.locator('input[type="checkbox"]'))
      .or(firstCheckboxRow.locator('[role="checkbox"]'))
      .first();

    await checkboxInRow
      .click({ force: true, timeout: 30_000 })
      .catch(async () => {
        await firstCheckboxRow.click({ force: true, timeout: 30_000 });
        await page.keyboard.press('Space').catch(() => {});
      });
  }

  await expect(proceed).toBeEnabled({ timeout: 30_000 });
  await proceed.click();
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // Step 2: Update Type Selection
  // The UI typically shows a supplier summary first with "Proceed with Request".
  // Clicking it transitions to the update-type dropdown ("Choose Option(s)").
  const proceedWithRequestPre = page
    .getByRole('button', { name: /proceed with request/i })
    .or(page.getByRole('link', { name: /proceed with request/i }))
    .first();

  await expect(proceedWithRequestPre).toBeVisible({ timeout: 180_000 });
  await expect(proceedWithRequestPre).toBeEnabled({ timeout: 180_000 });
  await proceedWithRequestPre.click({ timeout: 30_000 });
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // Find and click the nexxe select dropdown field for "Choose Option(s)"
  const chooseOptionsField = page
    .locator('dm-input')
    .filter({ has: page.locator('label').filter({ hasText: /Choose Option/i }) })
    .locator('.input-container[role="listbox"], .input-container[role="combobox"], [role="listbox"], [role="combobox"]')
    .first()
    .or(page.locator('[aria-label*="Choose Option(s)" i]'))
    .or(page.locator('[aria-label*="Choose Option" i]'))
    .first();

  await expect(chooseOptionsField).toBeVisible({ timeout: 60_000 });
  await chooseOptionsField.click({ timeout: 30_000 });
  await page.waitForTimeout(1500); // Wait for dropdown to open

  // Select the update type from dropdown
  const updateTypeToSelect = updateType.trim();
  console.log(`Selecting update type: ${updateTypeToSelect}`);

  // Try multiple strategies to find and click the option (similar to agent4)
  let optionSelected = false;

  // Strategy 1: Find by role="option"
  const optionByRole = page.getByRole('option', { name: new RegExp(escapeRegex(updateTypeToSelect), 'i') }).first();
  if (await optionByRole.count() > 0) {
    await optionByRole.click({ timeout: 30_000 });
    optionSelected = true;
  }

  // Strategy 2: Find by text and click parent option element
  if (!optionSelected) {
    const optionByText = page.getByText(new RegExp(escapeRegex(updateTypeToSelect), 'i'))
      .locator('xpath=ancestor::*[contains(@role, "option") or contains(@class, "option")]')
      .first();
    if (await optionByText.count() > 0) {
      await optionByText.click({ timeout: 30_000 });
      optionSelected = true;
    }
  }

  // Strategy 3: Find by text in dropdown panel
  if (!optionSelected) {
    const dropdownPanel = page.locator('.cdk-overlay-pane:visible, .mat-select-panel:visible, .dropdown-menu:visible').first();
    const panelOptions = dropdownPanel.locator('[role="option"], mat-option, .mat-option, .dropdown-item, li');
    const matchingOption = panelOptions.filter({ hasText: new RegExp(escapeRegex(updateTypeToSelect), 'i') }).first();
    if (await matchingOption.count() > 0) {
      await matchingOption.click({ timeout: 30_000 });
      optionSelected = true;
    }
  }

  // Strategy 4: Type the option text and press Enter (fallback)
  if (!optionSelected) {
    await page.keyboard.type(updateTypeToSelect);
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    optionSelected = true;
  }

  await page.waitForTimeout(1000); // Wait after selection

  // Close the dropdown
  const dropdownPanel = page.locator('.cdk-overlay-pane:visible, .mat-select-panel:visible, .dropdown-menu:visible').first();
  const isDropdownOpen = await dropdownPanel.isVisible().catch(() => false);
  
  if (isDropdownOpen) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    
    const stillOpen = await dropdownPanel.isVisible().catch(() => false);
    if (stillOpen) {
      await page.mouse.click(10, 10);
      await page.waitForTimeout(500);
    }
  }
  await expect(dropdownPanel).toBeHidden({ timeout: 10_000 }).catch(() => {});

  // Some variants show another "Proceed with Request" after selecting update type; best-effort click.
  const proceedWithRequestPost = page
    .getByRole('button', { name: /proceed with request/i })
    .or(page.getByRole('link', { name: /proceed with request/i }))
    .first();

  // In the "Select Option(s)" view, the actual CTA is typically "Proceed" (not "Proceed with Request").
  // Some builds still render a disabled "Proceed with Request" button; don't block on it.
  const proceedPost = page
    .getByRole('button', { name: /^proceed$/i })
    .or(page.getByRole('link', { name: /^proceed$/i }))
    .last();

  const clicked = await clickFirstEnabled(
    page,
    [
      { name: 'Proceed', locator: proceedPost },
      { name: 'Proceed with Request', locator: proceedWithRequestPost },
    ],
    { timeoutMs: 60_000 },
  );

  if (clicked) {
    console.log(`Clicked post-selection CTA: ${clicked}`);
    aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
  } else {
    console.warn('No enabled CTA found after selecting update type; continuing to next step.');
  }

  // Step 3: Detail Input Request
  const detailPrompt = page.getByText(/Can you explain in detail|exact changes you want to make/i);
  await expect(detailPrompt.first()).toBeVisible({ timeout: 1200_000 });
  await expect(askField).toBeVisible({ timeout: 1200_000 });

  await askField.fill(reasonAction);
  await askField.press('Enter').catch(() => {});
  aiEventsCount = await waitForAiEvents(page, aiEventsCount);

  // Step 4: Document Upload Request
  const uploadPrompt = page.getByText(/Please upload the required supporting document|upload.*document/i);
  const hasUploadPrompt = await uploadPrompt.first().isVisible({ timeout: 1200_000 }).catch(() => false);

  if (hasUploadPrompt) {
    // Determine file path - default to Desktop\a.xlsx if not specified
    let filePath: string;
    
    if (uploadFile && uploadFile.trim()) {
      filePath = uploadFile.trim();
    } else {
      // Default to Desktop\a.xlsx
      const homeDir = os.homedir();
      filePath = path.join(homeDir, 'Desktop', 'a.xlsx');
      console.log(`No UPLOAD_FILE_5 specified, using default: ${filePath}`);
    }
    
    // Resolve file path
    if (!path.isAbsolute(filePath)) {
      const projectRoot = process.cwd();
      const resolvedPath = path.resolve(projectRoot, filePath);
      if (fs.existsSync(resolvedPath)) {
        filePath = resolvedPath;
      } else {
        // Try Desktop path
        const homeDir = os.homedir();
        const desktopPath = path.join(homeDir, 'Desktop', path.basename(filePath));
        if (fs.existsSync(desktopPath)) {
          filePath = desktopPath;
        } else {
          console.warn(`File not found at ${resolvedPath} or ${desktopPath}. Please ensure the file exists.`);
        }
      }
    }

    if (fs.existsSync(filePath)) {
      console.log(`Uploading file: ${filePath}`);
      
      // Wait for upload section to be fully loaded
      await page.waitForTimeout(1000);
      
      // Step 1: Prepare to catch the file chooser dialog BEFORE clicking Browse
      const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 30_000 });

      // Step 2: Click the "Browse" button/link - try multiple strategies
      console.log('Looking for Browse button...');
      let browseClicked = false;
      
      // Strategy 1: Find Browse link near "Please select attachments" label
      const attachmentsLabel = page.getByText(/Please select attachments/i).first();
      if (await attachmentsLabel.count() > 0) {
        try {
          await expect(attachmentsLabel).toBeVisible({ timeout: 10_000 });
          // Find Browse link near this label
          const browseNearLabel = attachmentsLabel
            .locator('xpath=following::*[contains(text(), "Browse") or contains(@class, "browse")]')
            .or(page.locator('a:has-text("Browse")').filter({ has: attachmentsLabel.locator('xpath=ancestor::*[1]') }))
            .first();
          
          if (await browseNearLabel.count() > 0) {
            await expect(browseNearLabel).toBeVisible({ timeout: 10_000 });
            await browseNearLabel.scrollIntoViewIfNeeded();
            await browseNearLabel.click({ timeout: 10_000 });
            browseClicked = true;
            console.log('Clicked Browse button (found near label)');
          }
        } catch (e) {
          console.log('Strategy 1 failed, trying next...');
        }
      }
      
      // Strategy 2: Find Browse as clickable link/button
      if (!browseClicked) {
        const browseLink = page
          .getByRole('link', { name: /Browse/i })
          .or(page.locator('a:has-text("Browse")'))
          .or(page.locator('button:has-text("Browse")'))
          .or(page.locator('span:has-text("Browse")'))
          .or(page.locator('[class*="browse"]'))
          .or(page.getByText(/Browse/i).filter({ hasNot: page.locator('input') }))
          .last();
        
        if (await browseLink.count() > 0) {
          try {
            await expect(browseLink).toBeVisible({ timeout: 30_000 });
            await browseLink.scrollIntoViewIfNeeded();
            await page.waitForTimeout(500);
            await browseLink.click({ timeout: 30_000, force: true });
            browseClicked = true;
            console.log('Clicked Browse button (found as link/button)');
          } catch (e) {
            console.log('Strategy 2 failed, trying next...');
          }
        }
      }
      
      // Strategy 3: Use JavaScript to find and click Browse
      if (!browseClicked) {
        const clicked = await page.evaluate(() => {
          // Find all clickable elements with "Browse" text
          const elements = Array.from(document.querySelectorAll('a, button, span, div, label'));
          for (const el of elements) {
            const text = (el.textContent || '').trim();
            if (/^Browse$/i.test(text) && !el.closest('input')) {
              const htmlEl = el as HTMLElement;
              htmlEl.scrollIntoView({ behavior: 'instant', block: 'center' });
              htmlEl.click();
              return true;
            }
          }
          return false;
        });
        
        if (clicked) {
          browseClicked = true;
          console.log('Clicked Browse button (via JavaScript)');
          await page.waitForTimeout(500);
        }
      }
      
      if (!browseClicked) {
        throw new Error('Could not find or click Browse button');
      }

      // Step 3: Wait for file chooser dialog and select the file
      // fileChooser.setFiles() automatically selects the file and clicks "Open" (OK)
      console.log('Waiting for file chooser dialog...');
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(filePath);
      console.log(`Selected file: ${path.basename(filePath)}`);
      
      // Step 4: Wait for file to be processed and appear in UI
      await page.waitForTimeout(2000);
      
      // Verify file was selected (check for file name in UI)
      const fileName = path.basename(filePath);
      const fileDisplayed = page.getByText(fileName, { exact: false });
      await expect(fileDisplayed.first()).toBeVisible({ timeout: 10_000 }).catch(() => {
        console.log(`File name "${fileName}" not visible in UI, but continuing...`);
      });
      await page.waitForTimeout(1000);

      // Step 5: Click "Done" button
      console.log('Clicking Done button');
      const doneBtn = page
        .getByRole('button', { name: /^done$/i })
        .or(page.locator('button:has-text("Done")'))
        .last();
      await expect(doneBtn).toBeVisible({ timeout: 30_000 });
      await expect(doneBtn).toBeEnabled({ timeout: 30_000 });
      await doneBtn.click();
      await page.waitForTimeout(1000);

      // Step 6: Click "Add" button
      console.log('Clicking Add button');
      const addBtn = page
        .getByRole('button', { name: /^add$/i })
        .or(page.locator('button.option-btn:has-text("Add")'))
        .or(page.locator('button:has-text("Add")'))
        .last();
      await expect(addBtn).toBeVisible({ timeout: 30_000 });
      await expect(addBtn).toBeEnabled({ timeout: 30_000 });
      await addBtn.click();
      await page.waitForTimeout(1000);
      
      aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
      console.log('File upload completed successfully');
    } else {
      console.warn(`File ${filePath} does not exist. Skipping file upload.`);
      // Try to proceed without file upload - look for Skip button
      const skipBtn = page.getByRole('button', { name: /skip/i }).last();
      if (await skipBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
        console.log('Clicking Skip button to proceed without file upload...');
        await skipBtn.click({ timeout: 30_000 }).catch(() => {});
        await page.waitForTimeout(1000);
        aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
      } else {
        console.log('No Skip button found, proceeding without file upload...');
        // Wait a bit for UI to update
        await page.waitForTimeout(2000);
      }
    }
  } else {
    // No upload prompt - continue to next step
    console.log('No file upload prompt found, proceeding to summary...');
  }

  // Step 5: Request Summary and Confirmation
  // Wait for summary message after file upload step (if any) is handled
  console.log('Waiting for request summary...');
  const summaryMessage = page.getByText(/Thanks! I have found|Summary of Your Request/i);
  await expect(summaryMessage.first()).toBeVisible({ timeout: 180_000 });
  console.log('Summary message found');
  
  // Wait for supplier details to be visible
  await expect(page.getByText(/Supplier Legal Name|Supplier Partner Number/i)).toBeVisible({ timeout: 60_000 }).catch(() => {
    console.log('Supplier details not found, but continuing...');
  });

  // Step 5: Click "Create Request" button
  console.log('Looking for Create Request button...');
  await page.waitForTimeout(2000); // Wait for UI to stabilize after summary
  
  const createRequestBtn = page
    .locator('button.option-btn:has-text("Create Request")')
    .or(page.getByRole('button', { name: /^create request$/i }))
    .or(page.locator('button').filter({ hasText: /create request/i }))
    .or(page.getByRole('button', { name: /create request/i }))
    .last();
    
  await expect(createRequestBtn).toBeVisible({ timeout: 240_000 });
  await expect(createRequestBtn).toBeEnabled({ timeout: 240_000 });
  console.log('Create Request button found and enabled');

  try {
    console.log('Clicking Create Request button...');
    await createRequestBtn.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await createRequestBtn.click({ timeout: 30_000 });
  } catch {
    console.log('Retrying Create Request button click with force...');
    await createRequestBtn.click({ timeout: 30_000, force: true });
  }
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
  console.log('Create Request button clicked, finalizing flow...');
  await page.waitForTimeout(2000); // Wait for UI to update after Create Request
  const end = await finalizeRequestFlow(page);
  console.log(`✅ Finalized flow. Ended by: ${end.endedBy}`);
}

function getAskMeAnythingField(page: Page): Locator {
  return page
    .getByRole('textbox', { name: /^prompt$/i })
    .or(page.getByRole('textbox', { name: /prompt|ask me anything/i }))
    .or(page.getByPlaceholder(/ask me anything/i))
    .or(page.getByLabel(/ask me anything/i));
}