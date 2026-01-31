import { expect, type Locator, type Page } from '@playwright/test';
import { getEnv } from '../utils/env';
import type { AgentContext } from './types';
import { waitForAiEvents } from './aiEvents';
import { clickTerminationReason, normalizeTerminationStatus } from './terminationUtils';

export async function workflowAgent3(_page: Page, _ctx: AgentContext) {
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
    await proceedWithRequest.click({ force: true, timeout: 30_000 });
  }
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

  // Termination mode selection
  const modePrompt = page.getByText(/how would you like to proceed with the termination\?/i);
  await expect(modePrompt.first()).toBeVisible({ timeout: 240_000 });

  // Agent 3 uses TERMINATION_STATUS_3 (defaults to 'future' to run date picker flow)
  const status = normalizeTerminationStatus(env.terminationStatus3) ?? 'future';
  if (status === 'immediate') {
    const terminateImmediately = page.getByRole('button', { name: /terminate immediately/i });
    await expect(terminateImmediately).toBeVisible({ timeout: 240_000 });
    await terminateImmediately.click();
    aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
  } else {
    const futureDate = page.getByRole('button', { name: /terminate for a future date/i });
    await expect(futureDate).toBeVisible({ timeout: 240_000 });
    await futureDate.click();
    aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

    // Date selection step (only for "future")
    const datePrompt = page.getByText(/capture the new contract termination date/i);
    await expect(datePrompt.first()).toBeVisible({ timeout: 60_000 });

  // =====================================================
  // SIMPLIFIED DATE PICKER LOGIC
  // =====================================================
  
  // Wait for the Proceed button to appear (confirms date section is loaded)
  const proceedBtn = page.getByRole('button', { name: /^proceed$/i });
  await expect(proceedBtn).toBeVisible({ timeout: 60_000 });

  // Find and click the date picker to open it
  await openDatePicker(page);

  // Wait for calendar to be visible (could be mat-calendar, overlay, or any calendar popup)
  await expect(
    page.locator('.mat-calendar, .cdk-overlay-pane, .mat-datepicker-content, [role="dialog"], [role="grid"]').first()
  ).toBeVisible({ timeout: 30_000 });

  // Select the date from env variables
  // Parse date from env: can be full date (YYYY-MM-DD) or separate year/month/day
  let year = 2028;
  let month = 'JAN';
  let day = 20;

  if (env.terminationDate3) {
    // Parse date string (format: YYYY-MM-DD or YYYY/MM/DD)
    const dateMatch = env.terminationDate3.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (dateMatch) {
      year = parseInt(dateMatch[1]);
      const monthNum = parseInt(dateMatch[2]);
      day = parseInt(dateMatch[3]);
      // Convert month number to abbreviation
      const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
      month = monthNames[monthNum - 1] || 'JAN';
    }
  } else {
    // Use separate year/month/day env variables
    if (env.terminationYear3) {
      year = parseInt(env.terminationYear3);
    }
    if (env.terminationMonth3) {
      // If it's a number (01-12), convert to abbreviation
      const monthNum = parseInt(env.terminationMonth3);
      if (!isNaN(monthNum) && monthNum >= 1 && monthNum <= 12) {
        const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        month = monthNames[monthNum - 1];
      } else {
        // Assume it's already an abbreviation (JAN, FEB, etc.)
        month = env.terminationMonth3.toUpperCase().substring(0, 3);
      }
    }
    if (env.terminationDay3) {
      day = parseInt(env.terminationDay3);
    }
  }

  console.log(`Selecting termination date: ${day} ${month} ${year}`);
  await selectDateInMaterialCalendar(page, year, month, day);

  // Click outside to close calendar if still open
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(300);

    // Click Proceed
    await expect(proceedBtn).toBeEnabled({ timeout: 60_000 });
    await proceedBtn.click();
    aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
  }

  // =====================================================
  // END DATE PICKER LOGIC
  // =====================================================

  // Termination reason: select first option
  const reasonPrompt = page.getByText(/what is the reason for terminating this contract\?/i);
  await expect(reasonPrompt.first()).toBeVisible({ timeout: 240_000 });

  // Use REASON_TERMINATE_3 for agent3
  await clickTerminationReason(page, env.reasonTerminate3);
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


/**
 * Opens the date picker by clicking on the date input field STRICTLY
 * UI shows: calendar icon on left, "*Date" label, "DD/MM/YYYY" placeholder
 */
async function openDatePicker(page: Page): Promise<void> {
  // Check if calendar is already open
  const isCalendarOpen = async () => {
    const matCal = await page.locator('.mat-calendar').isVisible().catch(() => false);
    const overlay = await page.locator('.cdk-overlay-pane').isVisible().catch(() => false);
    const datepicker = await page.locator('.mat-datepicker-content').isVisible().catch(() => false);
    return matCal || overlay || datepicker;
  };

  if (await isCalendarOpen()) return;

  // Wait for the date field section to be fully rendered
  await page.waitForTimeout(2000);

  // STRICT APPROACH: Find the actual input field element directly
  // Priority 1: Find input with placeholder containing "DD/MM/YYYY" or "date"
  const dateInput = page.locator('input[placeholder*="DD/MM/YYYY" i], input[placeholder*="dd/mm/yyyy" i], input[placeholder*="date" i]').first();
  
  if (await dateInput.count() > 0) {
    // Ensure it's visible
    await expect(dateInput).toBeVisible({ timeout: 10_000 });
    
    // Click the input field STRICTLY - use scrollIntoView and click
    await dateInput.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    
    // Try clicking the input directly
    await dateInput.click({ force: true, timeout: 10_000 });
    await page.waitForTimeout(1000);
    if (await isCalendarOpen()) return;
    
    // If direct click didn't work, try clicking via JavaScript (strict)
    await dateInput.evaluate((el: HTMLElement) => {
      (el as HTMLInputElement).focus();
      (el as HTMLInputElement).click();
    });
    await page.waitForTimeout(1000);
    if (await isCalendarOpen()) return;
  }

  // Priority 2: Find input field by finding the text "DD/MM/YYYY" and getting its parent input
  const ddmmyyyyText = page.getByText(/DD\/MM\/YYYY|dd\/mm\/yyyy/i).first();
  if (await ddmmyyyyText.count() > 0) {
    await expect(ddmmyyyyText).toBeVisible({ timeout: 10_000 });
    
    // Find the input element near this text - look in parent containers
    const parentContainer = ddmmyyyyText.locator('xpath=ancestor::div[1]');
    const inputNearText = parentContainer.locator('input').first();
    if (await inputNearText.count() > 0) {
      await inputNearText.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await inputNearText.click({ force: true, timeout: 10_000 });
      await page.waitForTimeout(1000);
      if (await isCalendarOpen()) return;
    }
    
    // Or click the text element itself (it might be inside the input wrapper)
    await ddmmyyyyText.click({ force: true, timeout: 10_000 });
    await page.waitForTimeout(1000);
    if (await isCalendarOpen()) return;
  }

  // Priority 3: Find mat-datepicker-toggle button (calendar icon)
  const toggle = page.locator('mat-datepicker-toggle button, [class*="datepicker-toggle"] button, button[aria-label*="calendar" i], button[aria-label*="date" i]').first();
  if (await toggle.count() > 0) {
    await expect(toggle).toBeVisible({ timeout: 10_000 });
    await toggle.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
    await toggle.click({ force: true, timeout: 10_000 });
    await page.waitForTimeout(1000);
    if (await isCalendarOpen()) return;
  }

  // Priority 4: Find input by "*Date" label - locate the input in the same form field
  const dateLabel = page.getByText(/^\*\s*Date$/i).first();
  if (await dateLabel.count() > 0) {
    await expect(dateLabel).toBeVisible({ timeout: 10_000 });
    
    // Find input in the same container/form field - look in parent and following siblings
    const parentField = dateLabel.locator('xpath=ancestor::div[1]');
    const inputInField = parentField.locator('input').first();
    if (await inputInField.count() > 0) {
      await inputInField.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await inputInField.click({ force: true, timeout: 10_000 });
      await page.waitForTimeout(1000);
      if (await isCalendarOpen()) return;
    }
    
    // Try finding input after the label
    const inputAfterLabel = dateLabel.locator('xpath=following::input[1]').first();
    if (await inputAfterLabel.count() > 0) {
      await inputAfterLabel.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await inputAfterLabel.click({ force: true, timeout: 10_000 });
      await page.waitForTimeout(1000);
      if (await isCalendarOpen()) return;
    }
  }

  // Priority 5: Find any input in the "Termination Date" section
  const terminationDateSection = page.getByText(/termination date/i).first();
  if (await terminationDateSection.count() > 0) {
    // Look for input in parent containers
    const parentDiv = terminationDateSection.locator('xpath=ancestor::div[2]');
    const inputInSection = parentDiv.locator('input').first();
    if (await inputInSection.count() > 0) {
      await expect(inputInSection).toBeVisible({ timeout: 10_000 });
      await inputInSection.scrollIntoViewIfNeeded();
      await page.waitForTimeout(500);
      await inputInSection.click({ force: true, timeout: 10_000 });
      await page.waitForTimeout(1000);
      if (await isCalendarOpen()) return;
    }
  }

  // Final fallback: Use JavaScript to find and click the date input STRICTLY
  const clicked = await page.evaluate(() => {
    // Find input with date-related attributes
    const inputs = Array.from(document.querySelectorAll('input'));
    for (const input of inputs) {
      const htmlInput = input as HTMLInputElement;
      const placeholder = (htmlInput.placeholder || '').toLowerCase();
      const type = htmlInput.type || '';
      const className = input.className || '';
      
      if (
        placeholder.includes('dd/mm/yyyy') ||
        placeholder.includes('date') ||
        type === 'date' ||
        className.includes('date') ||
        className.includes('picker')
      ) {
        htmlInput.focus();
        htmlInput.click();
        return true;
      }
    }
    return false;
  });

  if (clicked) {
    await page.waitForTimeout(1000);
    if (await isCalendarOpen()) return;
  }

  // Final check - wait for calendar to appear
  await expect(page.locator('.mat-calendar, .cdk-overlay-pane, .mat-datepicker-content')).toBeVisible({ timeout: 15_000 });
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
  // This button shows current month/year like "FEBRUARY 2041"
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

  // After selecting year, we're back in month view
  // Navigate to the target month by clicking wrapper-actions-container
  await navigateToMonthInOverlay(page, overlay, month, year);
  await page.waitForTimeout(500);

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
 * Navigate to a specific month in the calendar (within overlay)
 * Uses wrapper-actions-container div to click next/previous buttons
 */
async function navigateToMonthInOverlay(page: Page, overlay: Locator, targetMonth: string, targetYear: number): Promise<void> {
  const monthNames = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 
                      'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  const monthAbbr = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  
  // Convert month abbreviation to full name for matching
  const targetMonthIndex = monthAbbr.indexOf(targetMonth.toUpperCase());
  const targetMonthFull = targetMonthIndex >= 0 ? monthNames[targetMonthIndex] : targetMonth.toUpperCase();
  
  const maxAttempts = 24; // Maximum 12 months forward + 12 months backward
  
  for (let i = 0; i < maxAttempts; i++) {
    // Get current month/year from period button
    const headerText = await overlay.locator('.mat-calendar-period-button').textContent().catch(() => '');
    const monthYearMatch = headerText?.match(/([A-Z]+)\s+(\d{4})/);
    
    if (monthYearMatch) {
      const currentMonth = monthYearMatch[1].toUpperCase();
      const currentYear = parseInt(monthYearMatch[2]);
      
      // Check if we're at the target month and year
      if (currentMonth === targetMonthFull && currentYear === targetYear) {
        return; // We're at the target month
      }
      
      // Determine if we need to go forward or backward
      const currentMonthIndex = monthNames.indexOf(currentMonth);
      const targetMonthIndexNum = monthAbbr.indexOf(targetMonth.toUpperCase());
      
      // If same year, navigate by month index
      if (currentYear === targetYear) {
        if (targetMonthIndexNum > currentMonthIndex) {
          // Need to go forward
          await clickNextMonthViaWrapper(page, overlay);
        } else if (targetMonthIndexNum < currentMonthIndex) {
          // Need to go backward
          await clickPreviousMonthViaWrapper(page, overlay);
        }
      } else if (targetYear > currentYear) {
        // Need to go forward (next year)
        await clickNextMonthViaWrapper(page, overlay);
      } else {
        // Need to go backward (previous year)
        await clickPreviousMonthViaWrapper(page, overlay);
      }
    } else {
      // Can't parse header, try clicking next
      await clickNextMonthViaWrapper(page, overlay);
    }
    
    await page.waitForTimeout(300);
  }
  
  // Final check - verify we're at the target month
  const finalHeaderText = await overlay.locator('.mat-calendar-period-button').textContent().catch(() => '');
  const finalMatch = finalHeaderText?.match(/([A-Z]+)\s+(\d{4})/);
  if (finalMatch) {
    const finalMonth = finalMatch[1].toUpperCase();
    const finalYear = parseInt(finalMatch[2]);
    const targetMonthFull = monthAbbr.indexOf(targetMonth.toUpperCase()) >= 0 
      ? monthNames[monthAbbr.indexOf(targetMonth.toUpperCase())] 
      : targetMonth.toUpperCase();
    
    if (finalMonth !== targetMonthFull || finalYear !== targetYear) {
      throw new Error(`Could not navigate to ${targetMonth} ${targetYear}. Current: ${finalMonth} ${finalYear}`);
    }
  }
}

/**
 * Click next month button via wrapper-actions-container div
 */
async function clickNextMonthViaWrapper(page: Page, overlay: Locator): Promise<void> {
  // Find the wrapper-actions-container div - search both in overlay and page level
  const wrapperActions = page.locator('.wrapper-actions-container.wrapper-actions').first();
  
  if (await wrapperActions.count() > 0) {
    // User specified to click on the wrapper div itself to navigate
    await wrapperActions.click({ timeout: 5_000 }).catch(() => {});
  } else {
    // Fallback: Try clicking the next button directly within overlay
    const nextButton = overlay.locator('.mat-calendar-next-button:not([disabled])').first();
    if (await nextButton.count() > 0) {
      await nextButton.click({ timeout: 5_000 }).catch(() => {});
    }
  }
}

/**
 * Click previous month button via wrapper-actions-container div
 */
async function clickPreviousMonthViaWrapper(page: Page, overlay: Locator): Promise<void> {
  // For previous navigation, find and click the previous button directly
  // The wrapper div click might only work for forward navigation
  const prevButton = overlay.locator('.mat-calendar-previous-button:not([disabled])').first();
  
  if (await prevButton.count() > 0) {
    await prevButton.click({ timeout: 5_000 }).catch(() => {});
  } else {
    // Fallback: Try finding previous button in wrapper-actions-container
    const wrapperActions = page.locator('.wrapper-actions-container.wrapper-actions').first();
    if (await wrapperActions.count() > 0) {
      const prevButtonInWrapper = wrapperActions.locator('.mat-calendar-previous-button:not([disabled])').first();
      if (await prevButtonInWrapper.count() > 0) {
        await prevButtonInWrapper.click({ timeout: 5_000 }).catch(() => {});
      }
    }
  }
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
      // Single year shown (like "FEBRUARY 2041") - check if we need to go back or forward
      const singleYearMatch = headerText?.match(/(\d{4})/);
      if (singleYearMatch) {
        const displayedYear = parseInt(singleYearMatch[1]);
        if (targetYear < displayedYear) {
          await overlay.locator('.mat-calendar-previous-button').click().catch(() => {});
        } else {
          await overlay.locator('.mat-calendar-next-button').click().catch(() => {});
        }
      } else {
        // Can't parse, try previous (to go backwards from 2041 to 2028)
        await overlay.locator('.mat-calendar-previous-button').click().catch(() => {});
      }
    }
    
    await page.waitForTimeout(200);
  }
}
