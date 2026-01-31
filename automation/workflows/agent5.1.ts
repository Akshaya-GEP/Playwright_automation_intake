import { expect, type Locator, type Page } from '@playwright/test';
import { getEnv } from '../utils/env';
import type { AgentContext } from './types';
import { waitForAiEvents } from './aiEvents';
import { escapeRegex } from './utils';
import * as path from 'path';
import * as fs from 'fs';

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
  const updateType = env.updateType5 || 'Block/ Unblock Supplier';
  const reasonAction = env.reasonAction5 || 'Block supplier because he was rude';
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
  // Wait for "Here are some updates" message
  const updatePrompt = page.getByText(/Here are some updates|update type|Choose Option/i);
  await expect(updatePrompt.first()).toBeVisible({ timeout: 180_000 });

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

  // FIX FOR STEP 2: Use .last() to target the NEW "Proceed" button at the bottom of the chat.
  const proceedAfterUpdate = page
    .getByRole('button', { name: /^proceed$/i })
    .filter({ hasNot: page.locator('[disabled]') })
    .last(); 
  
  await expect(proceedAfterUpdate).toBeVisible({ timeout: 60_000 });
  await proceedAfterUpdate.click({ timeout: 30_000 });
  
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // Step 3: Detail Input Request
  const detailPrompt = page.getByText(/Can you explain in detail|exact changes you want to make/i);
  await expect(detailPrompt.first()).toBeVisible({ timeout: 60_000 });
  await expect(askField).toBeVisible({ timeout: 60_000 });

  await askField.fill(reasonAction);
  await askField.press('Enter').catch(() => {});
  aiEventsCount = await waitForAiEvents(page, aiEventsCount);

  // Step 4: Document Upload Request
  const uploadPrompt = page.getByText(/Please upload the required supporting document|upload.*document/i);
  const hasUploadPrompt = await uploadPrompt.first().isVisible({ timeout: 30_000 }).catch(() => false);

  if (uploadFile && hasUploadPrompt) {
    let filePath = uploadFile.trim();
    
    // Resolve file path
    if (!path.isAbsolute(filePath)) {
      const projectRoot = process.cwd();
      const resolvedPath = path.resolve(projectRoot, filePath);
      if (fs.existsSync(resolvedPath)) {
        filePath = resolvedPath;
      } else {
        console.warn(`File not found at ${resolvedPath}. Please ensure the file exists or update UPLOAD_FILE_5 in .env`);
      }
    }

    if (fs.existsSync(filePath)) {
      // Step 1: Prepare to catch the file chooser dialog BEFORE clicking Browse
      const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 30_000 });

      // Step 2: Click the blue "Browse" text/link
      const browseLink = page
        .getByText(/Browse/i)
        .or(page.locator('a:has-text("Browse")'))
        .or(page.locator('[style*="color"]:has-text("Browse")'))
        .last();
      await expect(browseLink).toBeVisible({ timeout: 30_000 });
      await browseLink.click({ timeout: 30_000 });

      // Step 3: Wait for file chooser dialog and select the Excel file
      // fileChooser.setFiles() automatically selects the file and clicks "Open"
      const fileChooser = await fileChooserPromise;
      await fileChooser.setFiles(filePath);
      
      // Step 4: Wait for file to be processed and appear in UI
      await page.waitForTimeout(2000);
      
      // Verify file was selected (check for file name in UI if possible)
      const fileName = path.basename(filePath);
      await page.waitForTimeout(1000); // Additional wait for UI update

      // Step 5: Click "Done" button
      const doneBtn = page
        .getByRole('button', { name: /^done$/i })
        .or(page.locator('button:has-text("Done")'))
        .last();
      await expect(doneBtn).toBeVisible({ timeout: 30_000 });
      await expect(doneBtn).toBeEnabled({ timeout: 30_000 });
      await doneBtn.click();
      await page.waitForTimeout(1000);

      // Step 6: Click "Add" button
      const addBtn = page
        .getByRole('button', { name: /^add$/i })
        .or(page.locator('button.option-btn:has-text("Add")'))
        .or(page.locator('button:has-text("Add")'))
        .last();
      await expect(addBtn).toBeVisible({ timeout: 30_000 });
      await expect(addBtn).toBeEnabled({ timeout: 30_000 });
      await addBtn.click();
      
      aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
    } else {
      console.warn(`File ${filePath} does not exist. Skipping file upload.`);
    }
  } else if (hasUploadPrompt) {
    // Fallback: If prompt exists but no file provided, try to clear it if possible
    const doneBtn = page.getByRole('button', { name: /^done$/i }).last();
    if (await doneBtn.isVisible().catch(() => false)) {
      await doneBtn.click({ timeout: 30_000 }).catch(() => {});
    }
  }

  // Step 5: Request Summary and Confirmation
  const summaryMessage = page.getByText(/Thanks! I have found|Summary of Your Request/i);
  await expect(summaryMessage.first()).toBeVisible({ timeout: 180_000 });
  await expect(page.getByText(/Supplier Legal Name|Supplier Partner Number/i)).toBeVisible({ timeout: 60_000 });

  // Click "Create Request" button
  const createRequestBtn = page
    .locator('button.option-btn:has-text("Create Request")')
    .or(page.getByRole('button', { name: /^create request$/i }))
    .last(); // Use .last()
    
  await expect(createRequestBtn).toBeVisible({ timeout: 240_000 });
  await expect(createRequestBtn).toBeEnabled({ timeout: 240_000 });

  try {
    await createRequestBtn.click({ timeout: 30_000 });
  } catch {
    await createRequestBtn.click({ timeout: 30_000, force: true });
  }
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // Step 6: Request Creation - Wait for success message
  const successMessage = page.getByText(/Congratulations|Project Request has been sent for validation/i);
  await expect(successMessage.first()).toBeVisible({ timeout: 180_000 });

  // Step 7: Final Validation
  const sendForValidationBtn = page
    .locator('button.option-btn:has-text("Send for Validation")')
    .or(page.getByRole('button', { name: /send (for )?validation/i }))
    .or(page.getByRole('link', { name: /send (for )?validation/i }))
    .last();

  await expect(sendForValidationBtn).toBeVisible({ timeout: 240_000 });
  await expect(sendForValidationBtn).toBeEnabled({ timeout: 60_000 });

  try {
    await sendForValidationBtn.click({ timeout: 30_000 });
  } catch {
    await sendForValidationBtn.click({ timeout: 30_000, force: true });
  }
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // Wait for final confirmation
  const finalSuccess = page.getByText(/sent for validation|workflow complete/i);
  await expect(finalSuccess.first()).toBeVisible({ timeout: 180_000 }).catch(() => {});

  await page.waitForTimeout(5_000);
}

function getAskMeAnythingField(page: Page): Locator {
  return page
    .getByRole('textbox', { name: /^prompt$/i })
    .or(page.getByRole('textbox', { name: /prompt|ask me anything/i }))
    .or(page.getByPlaceholder(/ask me anything/i))
    .or(page.getByLabel(/ask me anything/i));
}