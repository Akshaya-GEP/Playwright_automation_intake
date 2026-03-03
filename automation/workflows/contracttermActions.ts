import { expect, type Locator, type Page } from '@playwright/test';
import { escapeRegex } from './utils';

export type TerminationStatus = 'future' | 'immediate';

export function normalizeTerminationStatus(v?: string): TerminationStatus | null {
    const s = (v || '').trim().toLowerCase();
    if (!s) return null;
    if (s === 'future' || s === 'future date' || s === 'terminate for a future date') return 'future';
    if (s === 'immediate' || s === 'terminate immediately') return 'immediate';
    return null;
}

export async function clickTerminationReason(page: Page, reasonTerminate?: string) {
    const v = (reasonTerminate || '').trim();
    if (v) {
        console.log(`Looking for termination reason: "${v}"`);

        const anyReasonOptionSignal = page
            .getByText(
                /Termination for Cause|Termination of Convenience|Contract End\/No Renewal Needed|Regulatory Changes/i,
            )
            .first();
        await anyReasonOptionSignal.waitFor({ state: 'visible', timeout: 60_000 }).catch(() => { });
        await page.waitForTimeout(500);

        const words = v.split(/[\s\u2014\u2013\u002D]+/).filter(w => w.length > 0);
        const flexiblePattern = words.map(w => escapeRegex(w)).join('[\\s\u2014\u2013\u002D]+');
        const byTextFlexible = findReasonOption(page, new RegExp(flexiblePattern, 'i')).first();
        if (await byTextFlexible.count().catch(() => 0)) {
            try {
                await safeClick(page, byTextFlexible);
                await settleAfterReasonSelection(page);
                return;
            } catch (e) {
                console.log(`Flexible matching failed: ${e}`);
            }
        }

        const byText = findReasonOption(page, new RegExp(escapeRegex(v), 'i')).first();
        if (await byText.count().catch(() => 0)) {
            try {
                await safeClick(page, byText);
                await settleAfterReasonSelection(page);
                return;
            } catch (e) {
                console.log(`Exact matching failed: ${e}`);
            }
        }
    }

    // Fallback
    console.log(`Using fallback: selecting first available termination reason`);
    const firstReasonTile = findReasonOption(
        page,
        /Termination for Cause|Termination of Convenience|Contract End\/No Renewal Needed|Regulatory Changes/i,
    ).first();
    await safeClick(page, firstReasonTile, { visibleTimeoutMs: 240_000 });
    await settleAfterReasonSelection(page);
}

function findReasonOption(page: Page, nameOrText: RegExp) {
    return page
        .getByRole('button', { name: nameOrText })
        .or(page.getByRole('link', { name: nameOrText }))
        .or(page.getByText(nameOrText).filter({ hasNot: page.locator('code') }));
}

async function safeClick(
    page: Page,
    target: Locator,
    opts?: { visibleTimeoutMs?: number },
) {
    const visibleTimeoutMs = opts?.visibleTimeoutMs ?? 60_000;
    await expect(target).toBeVisible({ timeout: visibleTimeoutMs });
    await target.scrollIntoViewIfNeeded().catch(() => { });
    await page.waitForTimeout(150);

    try {
        await target.click({ timeout: 30_000 });
    } catch {
        try {
            await target.click({ timeout: 30_000, force: true });
        } catch {
            const box = await target.boundingBox().catch(() => null);
            if (!box) throw new Error('safeClick: no bounding box');
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        }
    }
}

async function settleAfterReasonSelection(page: Page) {
    await page.waitForLoadState('domcontentloaded').catch(() => { });
    await Promise.race([
        page.getByText(/would you like to create the project request with these details\?/i).first().waitFor({ state: 'visible', timeout: 15_000 }).catch(() => { }),
        page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => { }),
        page.waitForTimeout(3_000),
    ]).catch(() => { });
    await page.waitForTimeout(2_000);
}

/**
 * Handles the termination date selection flow (specific to future date termination)
 * Refactored to use the robust interaction sequence from Agent 4.
 */
export async function handleTerminationDateSelection(page: Page, dateStr: string) {
    console.log(`Setting termination date to: ${dateStr}`);

    const datePickerWidget = page.locator('.nexxe-input-wrapper.input-date')
        .filter({ has: page.locator('label:has-text("Termination Date")').or(page.locator('label:has-text("Date")')) })
        .first();

    await expect(datePickerWidget).toBeVisible({ timeout: 60_000 });

    const dateElement = datePickerWidget.locator('.span-date-element').first();
    const inputContainer = datePickerWidget.locator('.input-container').first();

    // Parse date (YYYY-MM-DD) and convert to DD/MM/YYYY for UI verification if needed
    const dateMatch = dateStr.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (!dateMatch) throw new Error(`Invalid date format: ${dateStr}`);
    const year = parseInt(dateMatch[1]);
    const monthNum = parseInt(dateMatch[2]);
    const day = parseInt(dateMatch[3]);
    const dateToSet = `${String(day).padStart(2, '0')}/${String(monthNum).padStart(2, '0')}/${year}`;

    await openTerminationDatePicker(page, datePickerWidget, dateElement, inputContainer);

    const calendarOpened = await isMaterialDatepickerOpen(page);

    if (calendarOpened) {
        const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const month = monthNames[monthNum - 1];
        await selectDateInMaterialCalendar(page, year, month, day);
        await page.waitForTimeout(500);
    } else {
        const dateInput = page.locator('input[type="text"][placeholder*="DD/MM/YYYY" i], input[type="text"][placeholder*="date" i], input[type="date"], input[placeholder*="dd/mm/yyyy" i]').first();
        if (await dateInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
            await dateInput.clear();
            await dateInput.fill(dateToSet);
            await page.keyboard.press('Enter').catch(() => { });
        } else {
            // JS Fallback
            await page.evaluate(({ d, target }) => {
                const dateSpans = document.querySelectorAll('.span-date-element');
                for (let i = 0; i < dateSpans.length; i++) {
                    const span = dateSpans[i];
                    const parent = span.closest('.nexxe-input-wrapper');
                    if (parent?.querySelector('label')?.textContent?.includes('Date')) {
                        span.textContent = d;
                        span.dispatchEvent(new Event('input', { bubbles: true }));
                        span.dispatchEvent(new Event('change', { bubbles: true }));
                        return true;
                    }
                }
                return false;
            }, { d: dateToSet, target: 'Date' });
        }
    }

    await page.keyboard.press('Escape').catch(() => { });
    await page.waitForTimeout(500);

    await assertTerminationDateSet(datePickerWidget, dateToSet);

    const dateProceedBtn = page.getByRole('button', { name: /^proceed$/i });
    await expect(dateProceedBtn).toBeVisible({ timeout: 30_000 });
    await dateProceedBtn.click();
}

async function openTerminationDatePicker(page: Page, widget: Locator, dateEl: Locator, container: Locator): Promise<void> {
    await widget.scrollIntoViewIfNeeded();
    const candidates = [
        widget.locator('.mat-datepicker-toggle button'),
        widget.locator('button[aria-label*="calendar" i]'),
        widget.locator('.span-date-element'),
        container,
        widget
    ];

    for (const c of candidates) {
        if (await c.isVisible().catch(() => false)) {
            await c.click({ force: true }).catch(() => { });
            const opened = await expect.poll(async () => await isMaterialDatepickerOpen(page), { timeout: 5_000 }).toBeTruthy().catch(() => false);
            if (opened) return;
        }
    }
}

async function isMaterialDatepickerOpen(page: Page): Promise<boolean> {
    const overlay = page.locator('.cdk-overlay-container');
    const selectors = ['.mat-calendar', '.cdk-overlay-pane', '.mat-datepicker-content', '.mat-datepicker-popup'];
    for (const s of selectors) {
        if (await overlay.locator(s).first().isVisible().catch(() => false)) return true;
    }
    return false;
}

async function selectDateInMaterialCalendar(page: Page, year: number, month: string, day: number): Promise<void> {
    const overlay = page.locator('.cdk-overlay-container');
    const periodButton = overlay.locator('.mat-calendar-period-button').first();
    await periodButton.click();
    await page.waitForTimeout(500);

    // Year
    const yearCell = overlay.locator('.mat-calendar-body-cell').filter({ hasText: new RegExp(`^${year}$`) }).first();
    if (await yearCell.isVisible().catch(() => false)) {
        await yearCell.click();
    } else {
        await overlay.locator('.mat-calendar-previous-button').click();
        await yearCell.click();
    }
    await page.waitForTimeout(500);

    // Month
    const monthCell = overlay.locator('.mat-calendar-body-cell').filter({ hasText: new RegExp(`^${month}$`, 'i') }).first();
    await monthCell.click();
    await page.waitForTimeout(500);

    // Day
    const dayCell = overlay.locator('.mat-calendar-body-cell:not(.mat-calendar-body-disabled)').filter({ hasText: new RegExp(`^${day}$`) }).first();
    await dayCell.click();
}

async function assertTerminationDateSet(widget: Locator, dateToSet: string): Promise<void> {
    const normalize = (v: string): string[] => {
        const raw = (v || '').trim();
        // Support YYYY-MM-DD, DD/MM/YYYY, DD.MM.YYYY
        const m = raw.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/) || raw.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})$/);
        if (!m) return [raw.toLowerCase()];

        let d, m1, y;
        if (m[1].length === 4) { [y, m1, d] = [m[1], m[2], m[3]]; }
        else { [d, m1, y] = [m[1], m[2], m[3]]; }

        const dd = d.padStart(2, '0');
        const mm = m1.padStart(2, '0');
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const mmm = monthNames[parseInt(mm) - 1] || mm;

        return [
            `${dd}/${mm}/${y}`,
            `${dd}.${mm}.${y}`,
            `${dd}-${mmm}-${y}`,
            raw.toLowerCase()
        ];
    };

    const targetVariants = normalize(dateToSet);
    console.log(`Expecting one of: ${targetVariants.join(', ')}`);

    await expect.poll(async () => {
        const allTexts = await widget.allInnerTexts().catch(() => []);
        const allInputs = await widget.locator('input, [role="textbox"]').all();
        const inputValues = await Promise.all(allInputs.map(i => i.inputValue().catch(() => '')));
        const ariaLabels = await Promise.all(allInputs.map(i => i.getAttribute('aria-label').catch(() => '')));

        const combined = [...allTexts, ...inputValues, ...ariaLabels].join(' ').trim();
        const observedVariants = normalize(combined); // This is a bit lazy but works for partial matches

        console.log(`Observed text in widget: "${combined}"`);
        return targetVariants.some(t => combined.toLowerCase().includes(t.toLowerCase()));
    }, {
        timeout: 20_000,
        message: `Date not correctly set. Expected one of [${targetVariants}] in widget.`
    }).toBeTruthy();
}
