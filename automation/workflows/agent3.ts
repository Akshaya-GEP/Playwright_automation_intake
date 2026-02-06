import { expect, type Locator, type Page } from '@playwright/test';
import { getEnv } from '../utils/env';
import type { AgentContext } from './types';
import { waitForAiEvents } from './aiEvents';
import { clickTerminationReason, normalizeTerminationStatus } from './terminationUtils';
import { finalizeRequestFlow } from './utils';

export async function workflowAgent3(_page: Page, _ctx: AgentContext) {
  const page = _page;
  const env = getEnv();

  const askField = getPromptField(page);
  let aiEventsCount: number | null = null;

  try {
    console.log(`Starting Agent 3 Flow (Future Date Termination) with Query: ${env.userQuery3}`);
    
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
    console.log('Starting date selection step...');
    const datePrompt = page.getByText(/capture the new contract termination date/i);
    await expect(datePrompt.first()).toBeVisible({ timeout: 60_000 });
    console.log('Date prompt found');

  // =====================================================
  // SIMPLIFIED DATE PICKER LOGIC
  // =====================================================
  
  // Wait for the Proceed button to appear (confirms date section is loaded)
  console.log('Waiting for Proceed button to appear...');
  const proceedBtn = page.getByRole('button', { name: /^proceed$/i });
  await expect(proceedBtn).toBeVisible({ timeout: 60_000 });
  console.log('Proceed button found');

  // Find and click the date picker to open it
  console.log('Opening date picker...');
  try {
    await openDatePicker(page);
    console.log('Date picker opened successfully');
  } catch (error) {
    console.error('Failed to open date picker:', error);
    throw new Error(`Failed to open date picker: ${error}`);
  }

  // Wait for calendar to be visible (could be mat-calendar, overlay, or any calendar popup)
  console.log('Waiting for calendar to be visible...');
  await expect(
    page.locator('.mat-calendar, .cdk-overlay-pane, .mat-datepicker-content, [role="dialog"], [role="grid"]').first()
  ).toBeVisible({ timeout: 30_000 });
  console.log('Calendar is visible');

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
  try {
    await selectDateInMaterialCalendar(page, year, month, day);
    console.log('Date selected successfully');
  } catch (error) {
    console.error('Failed to select date:', error);
    throw new Error(`Failed to select date ${day} ${month} ${year}: ${error}`);
  }

  // Wait for calendar to close and date to be populated
  await page.waitForTimeout(1000);
  
  // Click outside to close calendar if still open
  await page.keyboard.press('Escape').catch(() => {});
  await page.waitForTimeout(500);

  // Verify date was selected by checking if Proceed button is enabled
  console.log('Verifying date selection and clicking Proceed...');
  await expect(proceedBtn).toBeEnabled({ timeout: 60_000 });
  console.log('Proceed button is enabled');
  
  await proceedBtn.click();
  console.log('Proceed button clicked');
  
  // Wait for AI events to process
  aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
  console.log('Date selection step completed, moving to next step...');
  
  // Wait a bit for the UI to update after proceeding
  await page.waitForTimeout(2000);
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
    console.error("❌ Agent 3 workflow failed!", error);
    // Log current page state for debugging
    try {
      const pageText = await page.locator('body').textContent().catch(() => 'Could not get page text');
      console.log('Page text preview at error:', pageText?.substring(0, 1000));
    } catch (e) {
      console.log('Could not get page text for debugging');
    }
    throw error;
  }
}

function getPromptField(page: Page): Locator {
  return page
    .getByRole('textbox', { name: /^prompt$/i })
    .or(page.getByRole('textbox', { name: /prompt|ask me anything/i }))
    .or(page.getByPlaceholder(/ask me anything/i));
}


/**
 * Opens the date picker by clicking on the date input field STRICTLY
 * UI can be either:
 * - Angular Material datepicker input (with calendar toggle)
 * - Nexxe date widget (label "Date" + span-date-element placeholder inside .nexxe-input-wrapper.input-date)
 */
async function openDatePicker(page: Page): Promise<void> {
  // Check if calendar is already open
  const isCalendarOpen = async (): Promise<boolean> => {
    const matCal = await page.locator('.mat-calendar').isVisible().catch(() => false);
    const overlay = await page.locator('.cdk-overlay-pane').isVisible().catch(() => false);
    const datepicker = await page.locator('.mat-datepicker-content').isVisible().catch(() => false);
    const backdrop = await page.locator('.cdk-overlay-backdrop-showing').isVisible().catch(() => false);
    const overlayContainerHasChildren = (await page.locator('.cdk-overlay-container > *').count().catch(() => 0)) > 0;
    return matCal || overlay || datepicker || backdrop || overlayContainerHasChildren;
  };

  if (await isCalendarOpen()) return;

  // Wait for the date field section to be fully rendered
  await page.waitForTimeout(2000);

  // PRIORITY 1: Try clicking the calendar icon button first (most reliable)
  // The calendar icon is on the left side of the date input
  const calendarIconButton = page.locator('mat-datepicker-toggle button, button[matDatepickerToggle], [class*="datepicker-toggle"] button, button[aria-label*="calendar" i], button[aria-label*="date" i]').first();
  if (await calendarIconButton.count() > 0) {
    try {
      await expect(calendarIconButton).toBeVisible({ timeout: 10_000 });
      // Scroll into view and click using Playwright methods
      await calendarIconButton.scrollIntoViewIfNeeded();
      await calendarIconButton.click({ timeout: 10_000 });
      await page.waitForTimeout(1000);
      if (await isCalendarOpen()) return;
    } catch (e) {
      console.log('Calendar icon button click failed, trying other methods...');
    }
  }

  // PRIORITY 2: Find input with placeholder "DD/MM/YYYY" and click it directly
  // Use Playwright locator instead of page.evaluate to avoid serialization issues
  const dateInputByPlaceholder = page.locator('input[placeholder*="DD/MM/YYYY" i], input[placeholder*="dd/mm/yyyy" i]').first();
  if (await dateInputByPlaceholder.count() > 0) {
    try {
      await expect(dateInputByPlaceholder).toBeVisible({ timeout: 10_000 });
      await dateInputByPlaceholder.scrollIntoViewIfNeeded();
      await dateInputByPlaceholder.click({ timeout: 10_000 });
      await page.waitForTimeout(1000);
      if (await isCalendarOpen()) return;
    } catch (e) {
      console.log('Date input by placeholder click failed, trying other methods...');
    }
  }

  // PRIORITY 3: Nexxe date widget (matches DOM snippet: label id="Date" + span-date-element placeholder)
  // User requirement: click on Date label first, then open date picker widget
  // Also: avoid repeated scrollIntoView calls (causes scrollbar "to and fro")
  const tryOpenNexxeDateWidget = async (): Promise<boolean> => {
    // Strong signal from DOM snippet: <label id="Date" class="input-label">Date</label>
    const dateLabelById = page.locator('label#Date, label[id="Date"]').first();
    const dateLabelByText = page.locator('label.input-label').filter({ hasText: /^Date$/i }).first();
    const dateLabel = (await dateLabelById.count()) ? dateLabelById : dateLabelByText;
    if (!(await dateLabel.count())) return false;

    // Find the containing nexxe widget wrapper from the label (most reliable)
    const widgetFromLabel = dateLabel.locator(
      'xpath=ancestor::div[contains(@class,"nexxe-input-wrapper") and contains(@class,"input-date")][1]'
    );
    const widget = (await widgetFromLabel.count())
      ? widgetFromLabel.first()
      : page.locator('.nexxe-input-wrapper.input-date').filter({ has: dateLabel }).first();

    if (!(await widget.count())) return false;

    await expect(widget).toBeVisible({ timeout: 10_000 });
    // Single scroll only (prevents bouncing)
    await widget.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);

    // 1) Click label first (focus)
    await dateLabel.click({ timeout: 5_000 }).catch(() => {});
    await page.waitForTimeout(200);

    // 2) Click the widget "input" area using mouse coords (avoids additional auto-scroll)
    const inputContainer = widget.locator('.input-container[aria-label="Date"], .input-container').first();
    const dateSpan = widget.locator('.span-date-element, .span-element.span-date-element').first();
    const clickTarget = (await dateSpan.count()) ? dateSpan : inputContainer;

    const clickByBoxCenter = async (loc: Locator): Promise<boolean> => {
      const box = await loc.boundingBox().catch(() => null);
      if (!box) return false;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      return true;
    };

    // A couple of attempts (sometimes first click just focuses)
    for (let attempt = 0; attempt < 2; attempt++) {
      // Prefer mouse click to avoid Playwright triggering more scrolling
      const clicked = await clickByBoxCenter(clickTarget).catch(() => false);
      if (!clicked) {
        // fallback to force click (still might scroll, but we already centered widget)
        await clickTarget.click({ timeout: 5_000, force: true }).catch(() => {});
      }
      // Wait briefly for CDK overlay to show up
      const overlayAppeared = await page
        .locator('.cdk-overlay-backdrop-showing, .cdk-overlay-pane, .mat-calendar, .mat-datepicker-content')
        .first()
        .isVisible()
        .catch(() => false);
      if (overlayAppeared || (await isCalendarOpen())) return true;
      await page.waitForTimeout(400);
    }

    return await isCalendarOpen();
  };

  if (await tryOpenNexxeDateWidget()) return;

  // PRIORITY 4: Find input by "*Date" label - locate the input field near it
  const dateLabel = page.getByText(/^\*\s*Date$/i).first();
  if (await dateLabel.count() > 0) {
    try {
      await expect(dateLabel).toBeVisible({ timeout: 10_000 });
      
      // Find input near the label using Playwright locators
      const dateInputNearLabel = dateLabel.locator('..').locator('input').first();
      if (await dateInputNearLabel.count() > 0) {
        try {
          await expect(dateInputNearLabel).toBeVisible({ timeout: 10_000 });
          await dateInputNearLabel.scrollIntoViewIfNeeded();
          await dateInputNearLabel.click({ timeout: 10_000 });
          await page.waitForTimeout(1000);
          if (await isCalendarOpen()) return;
        } catch (e) {
          // Try finding input in parent containers
          let parent = dateLabel.locator('..');
          for (let i = 0; i < 5; i++) {
            const inputInParent = parent.locator('input').first();
            if (await inputInParent.count() > 0) {
              try {
                await expect(inputInParent).toBeVisible({ timeout: 5_000 });
                await inputInParent.scrollIntoViewIfNeeded();
                await inputInParent.click({ timeout: 10_000 });
                await page.waitForTimeout(1000);
                if (await isCalendarOpen()) return;
                break;
              } catch (e2) {
                // Continue to next parent
              }
            }
            parent = parent.locator('..');
          }
        }
      }
    } catch (e) {
      console.log('Date label method failed, trying other methods...');
    }
  }

  // PRIORITY 5: Find input in "Termination Date" section
  const terminationDateSection = page.getByText(/termination date/i).first();
  if (await terminationDateSection.count() > 0) {
    try {
      // Find input near termination date section using Playwright locators
      let parent = terminationDateSection.locator('..');
      for (let i = 0; i < 5; i++) {
        const inputInParent = parent.locator('input').first();
        if (await inputInParent.count() > 0) {
          try {
            await expect(inputInParent).toBeVisible({ timeout: 5_000 });
            await inputInParent.scrollIntoViewIfNeeded();
            await inputInParent.click({ timeout: 10_000 });
            await page.waitForTimeout(1000);
            if (await isCalendarOpen()) return;
            break;
          } catch (e2) {
            // Continue to next parent
          }
        }
        parent = parent.locator('..');
      }
    } catch (e) {
      console.log('Termination date section method failed, trying fallback...');
    }
  }

  // FINAL FALLBACK: Use Playwright locator with force click (no scrolling)
  const dateInput = page.locator('input[placeholder*="DD/MM/YYYY" i], input[placeholder*="dd/mm/yyyy" i], input[type="date"]').first();
  if (await dateInput.count() > 0) {
    try {
      await expect(dateInput).toBeVisible({ timeout: 10_000 });
      // Use force click without scrolling
      await dateInput.click({ force: true, timeout: 10_000 });
      await page.waitForTimeout(1000);
      if (await isCalendarOpen()) return;
    } catch (e) {
      console.log('Final fallback click failed');
    }
  }

  // Final check - wait for calendar to appear
  try {
    // Do NOT use expect(locator).toBeVisible() on a locator that can resolve to multiple elements
    // (strict mode violation). Instead poll our computed "isCalendarOpen" signal.
    await expect
      .poll(async () => await isCalendarOpen(), { timeout: 15_000 })
      .toBeTruthy();
    console.log('Calendar appeared successfully');
    return;
  } catch (error) {
    console.error('Calendar did not appear after all attempts:', error);
    throw new Error(`Failed to open date picker calendar: ${error}`);
  }
}

/**
 * Selects a date in Angular Material calendar
 * The calendar popup is rendered in cdk-overlay-container
 */
async function selectDateInMaterialCalendar(page: Page, year: number, month: string, day: number): Promise<void> {
  console.log(`Starting date selection: ${day} ${month} ${year}`);
  
  // The calendar is rendered inside the overlay container
  const overlay = page.locator('.cdk-overlay-container');
  const calendar = overlay.locator('.mat-calendar, .mat-datepicker-content').first();
  
  try {
    await expect(calendar).toBeVisible({ timeout: 10_000 });
    console.log('Calendar overlay is visible');
  } catch (error) {
    console.error('Calendar overlay not visible:', error);
    throw new Error(`Calendar overlay not visible: ${error}`);
  }

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
      console.error(`Could not find enabled date cell for ${day} ${month} ${year}`);
      throw new Error(`Could not find enabled date cell for ${day} ${month} ${year}`);
    } else {
      console.log(`Date cell clicked successfully via JavaScript`);
    }
  }

  await page.waitForTimeout(1000);
  console.log('Date selection completed');
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
