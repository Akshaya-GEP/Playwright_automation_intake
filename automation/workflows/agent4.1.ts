import { expect, type Locator, type Page } from '@playwright/test';
import { getEnv } from '../utils/env';
import type { AgentContext } from './types';
import { waitForAiEvents } from './aiEvents';

/**
 * Contract Extension Workflow (Agent 4)
 * Uses env vars: userQuery4, reasonForExtension, modifications
 */
export async function workflowAgent4(page: Page, _ctx: AgentContext) {
  const env = getEnv();
  
  // Load Env Variables
  const query = env.userQuery4; 
  const reason = env.reasonForExtension; 
  const modificationChoice = env.modifications;
  const updateOption = env.updateOption || 'cost efficiency';
  const currency = env.currency || 'EUR';
  const estimatedCost = env.estimatedCost || '1000';
  const approval = env.approval || 'Approved'; 

  const askField = getAskMeAnythingField(page);
  let aiEventsCount: number | null = null;

  // --- Step 1: Trigger Flow ---
  // Wait for chat input and send the initial query defined in .env
  await expect(askField).toBeVisible({ timeout: 180_000 });
  await askField.click({ timeout: 30_000 }).catch(() => {});
  await askField.fill(query);
  await askField.press('Enter').catch(() => {});

  // --- Step 2: Contract Identification & Verification ---
  // Verify the bot found the contract (Matches: "I have found the CDR..." or "I have found CDR...")
  // Wait for response content first - this confirms the query was processed
  await expect(page.getByText(/I have found (the )?CDR/i)).toBeVisible({ timeout: 180_000 });
  
  // Try to wait for AI Events, but don't block if it doesn't appear (may be in AI Process tab or not visible)
  // IMPORTANT: "AI Events (N)" may not always be visible on the Answer tab
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
  
  // Verify Summary Card details are present
  await expect(page.getByText(/Contract Number:/i)).toBeVisible();
  await expect(page.getByText(/Expiry Date:/i)).toBeVisible();

  // Click "Proceed with Request"
  const proceedBtn = page.getByRole('button', { name: /proceed with request/i });
  await expect(proceedBtn).toBeVisible({ timeout: 60_000 });
  await proceedBtn.click();
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // --- Step 3: Date Selection ---
  // Bot Response: "Now, let's capture the contract extension date."
  // Filter out code elements to avoid strict mode violation
  const datePrompt = page.getByText(/capture the contract extension date/i)
    .filter({ hasNot: page.locator('code') })
    .first();
  await expect(datePrompt).toBeVisible({ timeout: 180_000 });

  // Parse date from env variables
  let dateToSet = '07/03/2028'; // Default date (DD/MM/YYYY format)
  
  if (env.extensionDate4) {
    // Parse date string (format: YYYY-MM-DD or YYYY/MM/DD) and convert to DD/MM/YYYY
    const dateMatch = env.extensionDate4.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (dateMatch) {
      const year = dateMatch[1];
      const month = dateMatch[2].padStart(2, '0');
      const day = dateMatch[3].padStart(2, '0');
      dateToSet = `${day}/${month}/${year}`; // Convert to DD/MM/YYYY
    }
  } else if (env.extensionYear4 && env.extensionMonth4 && env.extensionDay4) {
    // Use separate year/month/day env variables
    const year = env.extensionYear4;
    let month = env.extensionMonth4;
    const day = env.extensionDay4.padStart(2, '0');
    
    // Convert month abbreviation to number if needed
    if (isNaN(parseInt(month))) {
      const monthNames: { [key: string]: string } = {
        'JAN': '01', 'FEB': '02', 'MAR': '03', 'APR': '04', 'MAY': '05', 'JUN': '06',
        'JUL': '07', 'AUG': '08', 'SEP': '09', 'OCT': '10', 'NOV': '11', 'DEC': '12'
      };
      month = monthNames[month.toUpperCase().substring(0, 3)] || month;
    } else {
      month = month.padStart(2, '0');
    }
    dateToSet = `${day}/${month}/${year}`; // DD/MM/YYYY format
  }

  console.log(`Setting extension date to: ${dateToSet}`);

  // Locate the nexxe date picker widget
  // Structure: div.nexxe-input-wrapper.input-date with label "Extension Date"
  const datePickerWidget = page.locator('.nexxe-input-wrapper.input-date')
    .filter({ has: page.locator('label:has-text("Extension Date")') })
    .first();
  
  await expect(datePickerWidget).toBeVisible({ timeout: 60_000 });

  // Find the clickable date element inside the widget
  // The date is shown in span.span-date-element with aria-label (format: DD/MM/YYYY)
  // The input-container is also clickable
  const dateElement = datePickerWidget.locator('.span-date-element').first();
  const inputContainer = datePickerWidget.locator('.input-container').first();
  
  // Click to open/activate the date picker - try both elements
  if (await dateElement.count() > 0) {
    await dateElement.click({ force: true, timeout: 10_000 });
  } else if (await inputContainer.count() > 0) {
    await inputContainer.click({ force: true, timeout: 10_000 });
  } else {
    // Fallback: click the widget itself
    await datePickerWidget.click({ force: true, timeout: 10_000 });
  }
  
  await page.waitForTimeout(1000);

  // Check if Angular Material calendar opened (cdk-overlay-pane with mat-datepicker-popup)
  const materialCalendar = page.locator('.cdk-overlay-pane.mat-datepicker-popup, .mat-calendar, .mat-datepicker-content').first();
  const calendarOpened = await materialCalendar.isVisible({ timeout: 3_000 }).catch(() => false);
  
  if (calendarOpened) {
    // Material calendar opened - use the same date selection logic as agent3
    console.log('Material calendar detected, selecting date from calendar...');
    
    // Parse dateToSet (DD/MM/YYYY) to extract year, month, day
    const dateParts = dateToSet.split('/');
    const day = parseInt(dateParts[0]);
    const monthNum = parseInt(dateParts[1]);
    const year = parseInt(dateParts[2]);
    
    // Convert month number to abbreviation
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const month = monthNames[monthNum - 1] || 'JAN';
    
    // Use the date selection function from agent3
    await selectDateInMaterialCalendar(page, year, month, day);
    await page.waitForTimeout(500);
  } else {
    // No calendar opened - try input field or JavaScript approach
    const dateInput = page.locator('input[type="text"][placeholder*="DD/MM/YYYY" i], input[type="text"][placeholder*="date" i], input[type="date"], input[placeholder*="dd/mm/yyyy" i]').first();
    
    if (await dateInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
      // If input field is visible, clear and fill it with the date
      await dateInput.clear();
      await dateInput.fill(dateToSet);
      await page.keyboard.press('Enter').catch(() => {});
      await page.waitForTimeout(500);
    } else {
      // Try JavaScript to update the span-date-element
      try {
        const dateSet = await page.evaluate((dateValue) => {
          // Find the span-date-element for Extension Date
          const dateSpans = document.querySelectorAll('.span-date-element');
          for (let i = 0; i < dateSpans.length; i++) {
            const span = dateSpans[i];
            const ariaLabel = span.getAttribute('aria-label') || '';
            const parent = span.closest('.nexxe-input-wrapper');
            const hasExtensionLabel = parent?.querySelector('label')?.textContent?.includes('Extension Date') || false;
            
            if (hasExtensionLabel || ariaLabel.includes('Extension Date') || ariaLabel.match(/\d{2}\/\d{2}\/\d{4}/)) {
              // Update the span element
              span.setAttribute('aria-label', dateValue);
              span.setAttribute('title', dateValue);
              span.textContent = dateValue;
              
              // Trigger events to notify Angular of the change
              span.dispatchEvent(new Event('input', { bubbles: true }));
              span.dispatchEvent(new Event('change', { bubbles: true }));
              
              // Also try to find and update any hidden input
              const hiddenInput = parent?.querySelector('input[type="hidden"]');
              if (hiddenInput) {
                (hiddenInput as any).value = dateValue;
                hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
                hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
              }
              
              return true;
            }
          }
          return false;
        }, dateToSet);
        
        if (!dateSet) {
          console.log('Could not set date via JavaScript, date may already be set or widget needs calendar interaction');
        }
      } catch (error) {
        console.log('Error setting date via JavaScript:', error);
      }
      await page.waitForTimeout(500);
    }
  }
  
  // Close any open calendar/picker overlays
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  // Close any open calendar/picker overlays
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

  // Click "Proceed" (located inside the date step)
  const dateProceedBtn = page.getByRole('button', { name: /^proceed$/i });
  await expect(dateProceedBtn).toBeVisible({ timeout: 30_000 });
  await expect(dateProceedBtn).toBeEnabled({ timeout: 30_000 });
  await dateProceedBtn.click();
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // --- Step 4: Select Extension Reason ---
  // Bot Response: "Please select the reason..."
  // Filter out code elements to avoid strict mode violation
  const reasonPrompt = page.getByText(/select the reason for extension/i)
    .filter({ hasNot: page.locator('code') })
    .first();
  await expect(reasonPrompt).toBeVisible({ timeout: 180_000 });

  // Select option from ENV (e.g., "Continuation of Work or Services")
  // Using Regex to match the text even if casing differs slightly
  const reasonOption = page.getByRole('button', { name: new RegExp(reason ?? '', 'i') });
  await expect(reasonOption).toBeVisible({ timeout: 60_000 });
  await reasonOption.click();
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // --- Step 5: Contract Terms (Modifications) ---
  // Bot Response: "Contract Terms... Please select an option"
  // Filter out code elements to avoid strict mode violation
  const contractTermsPrompt = page.getByText(/Contract Terms/i)
    .filter({ hasNot: page.locator('code') })
    .first();
  await expect(contractTermsPrompt).toBeVisible({ timeout: 180_000 });

  // Wait for radio button group to appear
  const radioGroup = page.getByRole('radiogroup');
  await expect(radioGroup).toBeVisible({ timeout: 60_000 });

  // Select modification option from ENV (e.g., "Keep unchanged" or "Propose modifications")
  // Use MODIFICATIONS env variable - default to "Keep unchanged" if not set
  const modificationText = modificationChoice?.trim() || 'Keep unchanged';
  console.log(`Selecting modification option: ${modificationText}`);
  
  // Map the env variable to the actual radio button labels
  // "Keep unchanged" -> "Keep the current terms and conditions unchanged"
  // "Propose modifications" -> "Propose modifications to the terms and conditions"
  let targetLabelText = '';
  if (modificationText.toLowerCase().includes('keep') || modificationText.toLowerCase().includes('unchanged')) {
    targetLabelText = 'Keep the current terms and conditions unchanged';
  } else if (modificationText.toLowerCase().includes('propose') || modificationText.toLowerCase().includes('modification')) {
    targetLabelText = 'Propose modifications to the terms and conditions';
  } else {
    // Try to match the text as-is
    targetLabelText = modificationText;
  }
  
  // Find the radio button by its label text
  // The radio buttons have labels like "Keep the current terms and conditions unchanged"
  // Structure: <label for="..."> contains <span> with the text
  let radioOption = page
    .getByRole('radio', { name: new RegExp(targetLabelText, 'i') })
    .first();
  
  // If not found by role, try by label
  if (await radioOption.count() === 0) {
    radioOption = page
      .getByLabel(new RegExp(targetLabelText, 'i'))
      .first();
  }
  
  // If still not found, find the label element and get its associated radio input
  if (await radioOption.count() === 0) {
    // Find label that contains the target text
    const labelElement = page.locator('label').filter({ hasText: new RegExp(targetLabelText, 'i') }).first();
    if (await labelElement.count() > 0) {
      // Get the 'for' attribute to find the associated radio input
      const labelFor = await labelElement.getAttribute('for');
      if (labelFor) {
        radioOption = page.locator(`input[type="radio"]#${labelFor}`);
      } else {
        // If no 'for' attribute, find radio input in the same container
        const parentContainer = labelElement.locator('xpath=ancestor::div[contains(@class, "radio-chanel")]');
        radioOption = parentContainer.locator('input[type="radio"]').first();
      }
    }
  }
  
  // Final fallback: find all radio buttons and match by nearby label text
  if (await radioOption.count() === 0) {
    const allRadios = page.locator('input[type="radio"]');
    const radioCount = await allRadios.count();
    for (let i = 0; i < radioCount; i++) {
      const radio = allRadios.nth(i);
      const parent = radio.locator('xpath=ancestor::div[contains(@class, "radio-chanel")]');
      const labelText = await parent.locator('label span').textContent().catch(() => '');
      if (labelText && new RegExp(targetLabelText, 'i').test(labelText)) {
        radioOption = radio;
        break;
      }
    }
  }
  
  await expect(radioOption).toBeVisible({ timeout: 60_000 });
  await radioOption.click({ force: true });
  await page.waitForTimeout(500);
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
  
  // Verify radio button is selected
  await expect(radioOption).toBeChecked({ timeout: 5_000 });

  // Wait for "Proceed with selection" button to appear after radio selection
  // This button has class "option-btn" and text "Proceed with selection"
  // Prioritize finding button.option-btn with exact text match
  let proceedWithSelection = page
    .locator('button.option-btn')
    .filter({ hasText: /proceed with selection/i })
    .first();
  
  // If not found, try role-based selector
  if (await proceedWithSelection.count() === 0) {
    proceedWithSelection = page
      .getByRole('button', { name: /proceed with selection/i })
      .first();
  }
  
  // Fallback to "Proceed with Request" if "Proceed with selection" not found
  if (await proceedWithSelection.count() === 0) {
    proceedWithSelection = page
      .locator('button.option-btn')
      .filter({ hasText: /proceed with request/i })
      .first();
  }
  
  if (await proceedWithSelection.count() === 0) {
    proceedWithSelection = page
      .getByRole('button', { name: /proceed with request/i })
      .first();
  }
  
  await expect(proceedWithSelection).toBeVisible({ timeout: 60_000 });
  
  // Wait for button to become enabled, but if it stays disabled, click with force
  try {
    await expect(proceedWithSelection).toBeEnabled({ timeout: 10_000 });
    await proceedWithSelection.click();
  } catch {
    // Button is disabled, wait a bit more and try again
    await page.waitForTimeout(2000);
    const isEnabled = await proceedWithSelection.isEnabled().catch(() => false);
    if (isEnabled) {
      await proceedWithSelection.click();
    } else {
      // Button is still disabled, click with force
      console.log('Button is disabled, clicking with force...');
      await proceedWithSelection.click({ force: true });
    }
  }
  
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // --- Step 6: Supplier Discussion ---
  // Bot Response: "Have the proposed change(s) been discussed with the supplier? If yes, please provide a summary of the discussion?"
  // Filter out code elements to avoid strict mode violation
  const discussionPrompt = page.getByText(/discussed with the supplier/i)
    .filter({ hasNot: page.locator('code') })
    .first();
  await expect(discussionPrompt).toBeVisible({ timeout: 180_000 });

  // User Response: "yes, i have discussed" (with comma and space)
  await askField.fill('yes, i have discussed');
  await askField.press('Enter').catch(() => {});
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // After entering discussion response, wait for contract summary and click "Create Request"
  // Bot Response: Contract details summary with "Create Request" button
  // Filter out code elements to avoid strict mode violation
  const contractNumberText = page.getByText(/Contract Number:/i)
    .filter({ hasNot: page.locator('code') })
    .first();
  await expect(contractNumberText).toBeVisible({ timeout: 180_000 });
  
  const createRequestText = page.getByText(/Create Request/i)
    .filter({ hasNot: page.locator('code') })
    .first();
  await expect(createRequestText).toBeVisible({ timeout: 180_000 });

  // Click "Create Request" button
  const createRequestBtnAfterDiscussion = page.getByRole('button', { name: /^create request$/i });
  await expect(createRequestBtnAfterDiscussion).toBeEnabled({ timeout: 60_000 });
  await createRequestBtnAfterDiscussion.click();
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // Wait for response after clicking "Create Request"
  // Then click "Send for validation" button
  const sendForValidationBtn = page
    .getByRole('button', { name: /send for validation/i })
    .or(page.getByRole('link', { name: /send for validation/i }))
    .first();
  await expect(sendForValidationBtn).toBeVisible({ timeout: 180_000 });
  await expect(sendForValidationBtn).toBeEnabled({ timeout: 60_000 });
  await sendForValidationBtn.click();
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // --- Step 7: Update Option Selection ---
  // Bot Response: "What are the reason(s) for continuing with the current supplier? Update Option(s) Choose Update Option(s)"
  const updateOptionPrompt = page.getByText(/reason.*continuing with the current supplier/i)
    .or(page.getByText(/Choose Update Option/i))
    .or(page.locator('label').filter({ hasText: /Choose Update Option/i }));
  await expect(updateOptionPrompt.first()).toBeVisible({ timeout: 180_000 });

  // Find and click the nexxe select dropdown field for "Choose Update Option(s)"
  // Structure: dm-input > .nexxe-input-wrapper > .input-container[role="listbox"][aria-label="Choose Update Option(s)"]
  const updateOptionField = page
    .locator('dm-input')
    .filter({ has: page.locator('label').filter({ hasText: /Choose Update Option/i }) })
    .locator('.input-container[role="listbox"], .input-container[role="combobox"], [role="listbox"], [role="combobox"]')
    .first()
    .or(page.locator('[aria-label*="Choose Update Option(s)" i]'))
    .or(page.locator('[aria-label*="Choose Update Option" i]'))
    .first();

  await expect(updateOptionField).toBeVisible({ timeout: 60_000 });
  await updateOptionField.click({ timeout: 30_000 });
  await page.waitForTimeout(1500); // Wait for dropdown to open

  // Select the option from env variable (e.g., "cost efficiency")
  const optionToSelect = updateOption.trim();
  console.log(`Selecting update option: ${optionToSelect}`);
  
  // Try multiple strategies to find and click the option
  let optionSelected = false;
  
  // Strategy 1: Find by role="option"
  const optionByRole = page.getByRole('option', { name: new RegExp(optionToSelect, 'i') }).first();
  if (await optionByRole.count() > 0) {
    await optionByRole.click({ timeout: 30_000 });
    optionSelected = true;
  }
  
  // Strategy 2: Find by text and click parent option element
  if (!optionSelected) {
    const optionByText = page.getByText(new RegExp(optionToSelect, 'i'))
      .locator('xpath=ancestor::*[contains(@role, "option") or contains(@class, "option")]')
      .first();
    if (await optionByText.count() > 0) {
      await optionByText.click({ timeout: 30_000 });
      optionSelected = true;
    }
  }
  
  // Strategy 3: Type the option text and press Enter
  if (!optionSelected) {
    await page.keyboard.type(optionToSelect);
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
    optionSelected = true;
  }
  
  await page.waitForTimeout(1000);
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // --- Step 8: Currency and Estimated Cost ---
  // Bot Response: "Please provide the currency and estimated budget for this contract."
  const currencyBudgetPrompt = page.getByText(/currency and estimated budget/i)
    .or(page.getByText(/currency and estimated cost/i));
  await expect(currencyBudgetPrompt.first()).toBeVisible({ timeout: 180_000 });

  // Fill Currency field - could be a dropdown or select field
  const currencyLabel = page.locator('label').filter({ hasText: /^Currency$/i }).first();
  await expect(currencyLabel).toBeVisible({ timeout: 60_000 });
  
  // Find the currency field - could be dm-input, select, or input
  const currencyField = currencyLabel
    .locator('xpath=following::dm-input | following::select | following::input | following::*[@role="combobox"] | following::*[@role="listbox"]')
    .first()
    .or(page.locator('dm-input').filter({ has: page.locator('label').filter({ hasText: /^Currency$/i }) }))
    .or(page.locator('[aria-label*="Currency" i]'))
    .or(page.getByLabel(/^Currency$/i))
    .first();

  await expect(currencyField).toBeVisible({ timeout: 60_000 });
  
  // Click to open dropdown if it's a combobox/listbox
  const currencyInputContainer = currencyField.locator('.input-container, [role="listbox"], [role="combobox"]').first();
  if (await currencyInputContainer.count() > 0) {
    await currencyInputContainer.click({ timeout: 30_000 });
  } else {
    await currencyField.click({ timeout: 30_000 });
  }
  await page.waitForTimeout(1000);

  // Select currency from dropdown
  const currencyToSelect = currency.trim();
  console.log(`Selecting currency: ${currencyToSelect}`);
  
  let currencySelected = false;
  const currencyOption = page
    .getByRole('option', { name: new RegExp(currencyToSelect, 'i') })
    .or(page.getByText(new RegExp(currencyToSelect, 'i')).locator('xpath=ancestor::*[contains(@role, "option")]'))
    .first();

  if (await currencyOption.count() > 0) {
    await currencyOption.click({ timeout: 30_000 });
    currencySelected = true;
  }
  
  // Fallback: type currency if dropdown option not found
  if (!currencySelected) {
    await page.keyboard.type(currencyToSelect);
    await page.waitForTimeout(500);
    await page.keyboard.press('Enter');
  }
  await page.waitForTimeout(1000);

  // Fill Estimated Cost field
  const estimatedCostLabel = page.locator('label').filter({ hasText: /Estimated Cost/i }).first();
  await expect(estimatedCostLabel).toBeVisible({ timeout: 60_000 });
  
  const estimatedCostField = estimatedCostLabel
    .locator('xpath=following::input | following::*[@type="number"] | following::*[@type="text"]')
    .first()
    .or(page.locator('dm-input').filter({ has: page.locator('label').filter({ hasText: /Estimated Cost/i }) }).locator('input'))
    .or(page.locator('[aria-label*="Estimated Cost" i]'))
    .or(page.getByLabel(/Estimated Cost/i))
    .first();

  await expect(estimatedCostField).toBeVisible({ timeout: 60_000 });
  await estimatedCostField.click({ timeout: 30_000 });
  await estimatedCostField.fill(estimatedCost.trim());
  await page.waitForTimeout(500);

  // Click "Proceed" button
  const proceedBudgetBtn = page.getByRole('button', { name: /^proceed$/i });
  await expect(proceedBudgetBtn).toBeVisible({ timeout: 60_000 });
  await expect(proceedBudgetBtn).toBeEnabled({ timeout: 60_000 });
  await proceedBudgetBtn.click();
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // --- Step 9: Budget Approval ---
  // Bot Response: "Has your budget been approved by your cost center manager?"
  const approvalPrompt = page.getByText(/budget been approved/i)
    .or(page.getByText(/cost center manager/i));
  await expect(approvalPrompt.first()).toBeVisible({ timeout: 180_000 });

  // Select approval option from dropdown/radio buttons
  const approvalToSelect = approval.trim();
  const approvalField = page
    .locator('label')
    .filter({ hasText: /approval/i })
    .locator('xpath=following::select | following::*[@role="combobox"] | following::*[@role="radiogroup"]')
    .first()
    .or(page.locator('[aria-label*="approval" i]'))
    .or(page.getByRole('combobox').filter({ has: page.getByText(/approval/i) }))
    .first();

  await expect(approvalField).toBeVisible({ timeout: 60_000 });
  await approvalField.click({ timeout: 30_000 });
  await page.waitForTimeout(1000);

  // Select the approval option
  const approvalOption = page
    .getByRole('option', { name: new RegExp(approvalToSelect, 'i') })
    .or(page.getByRole('radio', { name: new RegExp(approvalToSelect, 'i') }))
    .or(page.getByText(new RegExp(approvalToSelect, 'i')).locator('xpath=ancestor::*[contains(@role, "option") or contains(@role, "radio")]'))
    .first();

  if (await approvalOption.count() > 0) {
    await approvalOption.click({ timeout: 30_000 });
  } else {
    // Fallback: type the approval text
    await page.keyboard.type(approvalToSelect);
    await page.keyboard.press('Enter');
  }
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // --- Step 11: Success Validation ---
  // Wait for the success message: "Congrats! Your Project Request has been sent for validation..."
  const successMessage = page.getByText(/Congrats.*Project Request.*sent for validation/i)
    .or(page.getByText(/sent for validation/i))
    .or(page.getByText(/Congrats/i));
  await expect(successMessage.first()).toBeVisible({ timeout: 180_000 });

  // End of flow pause
  // eslint-disable-next-line playwright/no-wait-for-timeout
  await page.waitForTimeout(5_000);
}

// --- Helpers ---

function getAskMeAnythingField(page: Page): Locator {
  return page
    .getByRole('textbox', { name: /^prompt$/i })
    .or(page.getByRole('textbox', { name: /prompt|ask me anything/i }))
    .or(page.getByPlaceholder(/ask me anything/i))
    .or(page.getByLabel(/ask me anything/i));
}

/**
 * Selects a date in Angular Material calendar
 * The calendar popup is rendered in cdk-overlay-container
 */
async function selectDateInMaterialCalendar(page: Page, year: number, month: string, day: number): Promise<void> {
  // The calendar is rendered inside the overlay container
  const overlay = page.locator('.cdk-overlay-container');
  const calendar = overlay.locator('.mat-calendar, .mat-datepicker-content').first();
  await expect(calendar).toBeVisible({ timeout: 10_000 });

  // Click the period button to switch to year/multi-year view
  // This button shows current month/year like "JANUARY 2026"
  const periodButton = overlay.locator('.mat-calendar-period-button').first();
  if (await periodButton.count()) {
    await periodButton.click();
    await page.waitForTimeout(500);
    
    // After first click, we might be in year view or multi-year view
    // Check if target year is visible, if not click again to go to multi-year
    const yearVisible = await overlay.locator('.mat-calendar-body-cell').filter({ hasText: new RegExp(`^${year}$`) }).count();
    if (!yearVisible) {
      // Click period button again to get to multi-year view
      await periodButton.click().catch(() => {});
      await page.waitForTimeout(500);
    }
  }

  // Navigate to and select the year (within overlay)
  await navigateToYearInOverlay(page, overlay, year);
  await page.waitForTimeout(500);

  // Select month (after selecting year, calendar shows months)
  // Month abbreviations: JAN, FEB, MAR, etc.
  // Filter out disabled months if any
  const monthCell = overlay
    .locator('.mat-calendar-body-cell')
    .filter({ hasNot: overlay.locator('.mat-calendar-body-disabled') })
    .filter({ hasText: new RegExp(`^${month}$`, 'i') })
    .first();
  
  if (await monthCell.count() > 0) {
    await expect(monthCell).toBeVisible({ timeout: 5_000 });
    await monthCell.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await monthCell.click({ force: true });
    await page.waitForTimeout(500);
  }

  // Select day - IMPORTANT: Filter out disabled dates
  // Disabled dates have class "mat-calendar-body-disabled" and aria-disabled="true"
  // We need to find enabled dates only - use CSS selector to exclude disabled
  const dayCellEnabled = overlay
    .locator('.mat-calendar-body-cell:not(.mat-calendar-body-disabled)')
    .filter({ hasNot: overlay.locator('[aria-disabled="true"]') })
    .filter({ hasText: new RegExp(`^${day}$`) })
    .first();
  
  // Try finding enabled date cell
  if (await dayCellEnabled.count() > 0) {
    await expect(dayCellEnabled).toBeVisible({ timeout: 5_000 });
    await dayCellEnabled.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await dayCellEnabled.click({ force: true });
  } else {
    // Fallback: Use JavaScript to find and click enabled date (more reliable)
    const clicked = await page.evaluate(({ targetDay, targetMonth, targetYear }: { targetDay: number; targetMonth: string; targetYear: number }) => {
      const cells = Array.from(document.querySelectorAll('.mat-calendar-body-cell'));
      for (const cell of cells) {
        // Skip disabled dates
        const isDisabled = cell.classList.contains('mat-calendar-body-disabled') || 
                          cell.getAttribute('aria-disabled') === 'true';
        if (isDisabled) continue;
        
        const ariaLabel = cell.getAttribute('aria-label') || '';
        const cellText = cell.textContent?.trim() || '';
        
        // Check if this is the target date
        // Match day number and verify year/month in aria-label
        if (cellText === String(targetDay) && 
            ariaLabel.includes(String(targetYear)) &&
            ariaLabel.toUpperCase().includes(targetMonth.toUpperCase())) {
          (cell as HTMLElement).click();
          return true;
        }
      }
      return false;
    }, { targetDay: day, targetMonth: month, targetYear: year });
    
    if (!clicked) {
      throw new Error(`Could not find enabled date cell for ${day} ${month} ${year}`);
    }
  }

  await page.waitForTimeout(500);
}

/**
 * Navigate to a specific year in the calendar (within overlay)
 */
async function navigateToYearInOverlay(page: Page, overlay: Locator, targetYear: number): Promise<void> {
  const maxAttempts = 30; // Increased for larger year gaps
  
  for (let i = 0; i < maxAttempts; i++) {
    // Check if target year is visible in the overlay
    // Filter out disabled years if any
    const yearCell = overlay
      .locator('.mat-calendar-body-cell')
      .filter({ hasNot: overlay.locator('.mat-calendar-body-disabled') })
      .filter({ hasText: new RegExp(`^${targetYear}$`) })
      .first();
    
    if (await yearCell.count() > 0) {
      await expect(yearCell).toBeVisible({ timeout: 5_000 });
      await yearCell.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await yearCell.click({ force: true });
      await page.waitForTimeout(500);
      return;
    }

    // Get current year range displayed from period button
    const headerText = await overlay.locator('.mat-calendar-period-button').textContent().catch(() => '');
    const yearsMatch = headerText?.match(/(\d{4})\s*[–-]\s*(\d{4})/);
    
    if (yearsMatch) {
      const startYear = parseInt(yearsMatch[1]);
      const endYear = parseInt(yearsMatch[2]);
      
      if (targetYear < startYear) {
        // Navigate backwards (previous)
        await overlay.locator('.mat-calendar-previous-button').click().catch(() => {});
      } else if (targetYear > endYear) {
        // Navigate forwards (next)
        await overlay.locator('.mat-calendar-next-button').click().catch(() => {});
      } else {
        // Year should be in range but cell not found - try clicking any visible year cell
        const anyYearCell = overlay.locator('.mat-calendar-body-cell').first();
        if (await anyYearCell.count()) {
          const cellText = await anyYearCell.textContent();
          // If we see individual years, we're in multi-year view
          if (cellText && /^\d{4}$/.test(cellText.trim())) {
            break; // Year should be visible but isn't, something's wrong
          }
        }
        break;
      }
    } else {
      // Single year shown (like "JANUARY 2026") - check if we need to go back or forward
      const singleYearMatch = headerText?.match(/(\d{4})/);
      if (singleYearMatch) {
        const displayedYear = parseInt(singleYearMatch[1]);
        if (targetYear < displayedYear) {
          await overlay.locator('.mat-calendar-previous-button').click().catch(() => {});
        } else {
          await overlay.locator('.mat-calendar-next-button').click().catch(() => {});
        }
      } else {
        // Can't parse, try previous (to go backwards)
        await overlay.locator('.mat-calendar-previous-button').click().catch(() => {});
      }
    }
    
    await page.waitForTimeout(200);
  }
}