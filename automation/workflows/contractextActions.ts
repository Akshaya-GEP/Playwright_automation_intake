import { expect, type Locator, type Page } from '@playwright/test';
import { escapeRegex } from './utils';
import { clickProceedIfPresent } from './uiActions';

/**
 * Common actions for Contract Extension Agent (Agent 4)
 * Refactored based on user-provided sequence and robust interaction logic.
 */

export async function handleExtensionDateSelection(page: Page, dateStr: string) {
    console.log(`Setting extension date to: ${dateStr}`);

    // The "Extension Date" widget can vary slightly across builds; find it by label text first.
    const labelRe = /extension\s+date/i;
    const datePickerWidget = page
        .locator('.nexxe-input-wrapper.input-date, .nexxe-input-wrapper, dm-input, .input-date')
        .filter({ has: page.locator('label').filter({ hasText: labelRe }) })
        .first();

    await expect(datePickerWidget).toBeVisible({ timeout: 60_000 });

    const dateElement = datePickerWidget.locator('.span-date-element').first();
    const inputContainer = datePickerWidget.locator('.input-container').first();

    // Parse date (supports YYYY-MM-DD, YYYY/MM/DD, DD/MM/YYYY, DD-MM-YYYY)
    const raw = (dateStr || '').trim();
    const mIso = raw.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
    const mDmy = raw.match(/^(\d{1,2})[\/\.\-](\d{1,2})[\/\.\-](\d{4})$/);
    if (!mIso && !mDmy) throw new Error(`Invalid date format: ${dateStr}`);

    let year: number, monthNum: number, day: number;
    if (mIso) {
        year = parseInt(mIso[1]);
        monthNum = parseInt(mIso[2]);
        day = parseInt(mIso[3]);
    } else {
        day = parseInt(mDmy![1]);
        monthNum = parseInt(mDmy![2]);
        year = parseInt(mDmy![3]);
    }

    const isoToSet = `${String(year).padStart(4, '0')}-${String(monthNum).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dmySlashToSet = `${String(day).padStart(2, '0')}/${String(monthNum).padStart(2, '0')}/${year}`;
    const monthNamesTitle = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mmm = monthNamesTitle[monthNum - 1] || String(monthNum).padStart(2, '0');
    const dMmmToSet = `${String(day).padStart(2, '0')}-${mmm}-${year}`;

    // Used for widget text assertion (we don't assume one exact display format)
    const dateToAssert = dmySlashToSet;

    await openExtensionDatePicker(page, datePickerWidget, dateElement, inputContainer);

    const calendarOpened = await isMaterialDatepickerOpen(page);

    if (calendarOpened) {
        const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const month = monthNames[monthNum - 1];
        await selectDateInMaterialCalendar(page, year, month, day);
        await page.waitForTimeout(500);
    } else {
        // Prefer filling the input INSIDE the widget (avoid any other date inputs on the page)
        const dateInput = datePickerWidget
            .locator('input[type="date"], input[placeholder*="DD/MM/YYYY" i], input[placeholder*="date" i], input, [role="textbox"]')
            .first();

        if (await dateInput.isVisible({ timeout: 3_000 }).catch(() => false)) {
            // Some widgets accept ISO, others accept DD/MM/YYYY; try best-match based on input type/placeholder.
            const type = (await dateInput.getAttribute('type').catch(() => '')) || '';
            const placeholder = (await dateInput.getAttribute('placeholder').catch(() => '')) || '';

            const preferred = type.toLowerCase() === 'date' ? isoToSet : (/(dd\/mm\/yyyy|dd\/mm)/i.test(placeholder) ? dmySlashToSet : dmySlashToSet);
            const fallbacks = [dmySlashToSet, isoToSet, dMmmToSet].filter((v, idx, arr) => arr.indexOf(v) === idx);

            await dateInput.click({ timeout: 30_000 }).catch(() => { });
            // Clear robustly (some inputs don't support .clear())
            await dateInput.fill('').catch(() => { });

            const toTry = [preferred, ...fallbacks.filter(v => v !== preferred)];
            for (const v of toTry) {
                await dateInput.fill(v).catch(() => { });
                await page.keyboard.press('Enter').catch(() => { });
                // Blur/click-away helps some builds commit the date
                await page.mouse.click(10, 10).catch(() => { });
                await page.waitForTimeout(250);

                const observed = await dateInput.inputValue().catch(() => '');
                if ((observed || '').trim()) break;
            }
        } else {
            // JS Fallback
            await page.evaluate(({ d }) => {
                const dateSpans = document.querySelectorAll('.span-date-element');
                for (let i = 0; i < dateSpans.length; i++) {
                    const span = dateSpans[i];
                    const parent = span.closest('.nexxe-input-wrapper');
                    if (parent?.querySelector('label')?.textContent?.includes('Extension Date')) {
                        span.textContent = d;
                        span.dispatchEvent(new Event('input', { bubbles: true }));
                        span.dispatchEvent(new Event('change', { bubbles: true }));
                        return true;
                    }
                }
                return false;
            }, { d: dmySlashToSet });
        }
    }

    await page.keyboard.press('Escape').catch(() => { });
    await page.waitForTimeout(500);

    await assertExtensionDateSet(datePickerWidget, dateToAssert);

    // Click Proceed (prefer visible+enabled button; some screens render multiple)
    const proceeded = await clickProceedIfPresent(page, 30_000).catch(() => false);
    if (!proceeded) {
        const proceedBtn = page.getByRole('button', { name: /^proceed$/i });
        await expect(proceedBtn.first()).toBeVisible({ timeout: 30_000 });
        // try a visible+enabled one first
        const count = await proceedBtn.count().catch(() => 0);
        for (let i = 0; i < count; i++) {
            const btn = proceedBtn.nth(i);
            if (await btn.isVisible().catch(() => false) && await btn.isEnabled().catch(() => false)) {
                await btn.click({ timeout: 30_000 }).catch(() => btn.click({ timeout: 30_000, force: true }));
                return;
            }
        }
        // fallback
        await proceedBtn.first().click({ timeout: 30_000, force: true }).catch(() => { });
    }
}

async function openExtensionDatePicker(page: Page, widget: Locator, dateEl: Locator, container: Locator): Promise<void> {
    // Mirror the more robust behavior used in other agents:
    // - focus label first (some widgets require this)
    // - click by bounding box center (reduces issues with overlays/intercepted clicks)
    // - retry a few times
    await widget.scrollIntoViewIfNeeded();
    await page.waitForTimeout(200).catch(() => { });

    const extensionLabel = widget.locator('label.input-label, label').filter({ hasText: /extension\s+date/i }).first();
    if (await extensionLabel.isVisible().catch(() => false)) {
        await extensionLabel.click({ timeout: 5_000 }).catch(() => { });
        await page.waitForTimeout(150).catch(() => { });
    }

    const clickByBoxCenter = async (loc: Locator): Promise<boolean> => {
        const box = await loc.boundingBox().catch(() => null);
        if (!box) return false;
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
        return true;
    };

    const widgetTextbox = widget.getByRole('textbox').first();
    const widgetInput = widget.locator('input').first();

    const candidates = [
        widget.locator('.mat-datepicker-toggle button').first(),
        widget.locator('button[aria-label*="calendar" i]').first(),
        widgetTextbox,
        widgetInput,
        dateEl,
        container,
        widget,
    ];

    for (let attempt = 0; attempt < 3; attempt++) {
        for (const c of candidates) {
            const cnt = await c.count().catch(() => 0);
            if (cnt === 0) continue;
            if (!(await c.isVisible().catch(() => false))) continue;

            const clicked = await clickByBoxCenter(c).catch(() => false);
            if (!clicked) {
                await c.click({ force: true, timeout: 5_000 }).catch(() => { });
            }

            const opened = await expect
                .poll(async () => await isMaterialDatepickerOpen(page), { timeout: 5_000 })
                .toBeTruthy()
                .then(() => true)
                .catch(() => false);
            if (opened) return;

            await page.waitForTimeout(250).catch(() => { });
        }
    }
}

async function isMaterialDatepickerOpen(page: Page): Promise<boolean> {
    const overlay = page.locator('.cdk-overlay-container');
    const selectors = ['.mat-calendar', '.cdk-overlay-pane', '.mat-datepicker-content', '.mat-datepicker-popup'];
    if (await overlay.locator('.cdk-overlay-backdrop-showing').first().isVisible().catch(() => false)) return true;
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

async function assertExtensionDateSet(widget: Locator, dateToSet: string): Promise<void> {
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
            `${y}-${mm}-${dd}`,
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

export async function clickExtensionReason(page: Page, reasonRaw?: string) {
    const v = (reasonRaw || '').trim();
    const candidates: RegExp[] = [];
    const lower = v.toLowerCase();

    if (lower) {
        if (lower.includes('admin') || lower.includes('budget')) candidates.push(/administrative\s+or\s+budget\s+delays/i);
        if (lower.includes('continuation') || lower.includes('work')) candidates.push(/continuation\s+of\s+work\s+or\s+services/i);
        if (lower.includes('performance') || lower.includes('satisfaction')) candidates.push(/performance\s+satisfaction/i);
        if (lower.includes('strategic') || lower.includes('operation')) candidates.push(/strategic\s+or\s+operation\s+reasons/i);
        candidates.push(new RegExp(escapeRegex(v), 'i'));
    }

    candidates.push(/continuation\s+of\s+work\s+or\s+services/i, /performance\s+satisfaction/i, /administrative\s+or\s+budget\s+delays/i, /strategic\s+or\s+operation\s+reasons/i);

    for (const re of candidates) {
        const btn = page.getByRole('button', { name: re }).first();
        if (await btn.isVisible().catch(() => false)) {
            await btn.click();
            return;
        }
    }
}

export async function selectModificationOptionSequence(page: Page, modificationText?: string, applicableOptions?: string) {
    const v = (modificationText || 'Keep unchanged').toLowerCase();
    let target = 'Keep the current terms and conditions unchanged';
    let isPropose = false;
    if (v.includes('propose') || v.includes('mod')) {
        target = 'Propose modifications to the terms and conditions';
        isPropose = true;
    }

    const radio = page.getByLabel(new RegExp(target, 'i')).or(page.getByRole('radio', { name: new RegExp(target, 'i') })).first();
    await expect(radio).toBeVisible({ timeout: 60_000 });
    await radio.click({ force: true });
    await page.waitForTimeout(1000);

    // Handle "Select Applicable Options" dropdown ONLY if Propose modifications was selected
    if (isPropose && applicableOptions) {
        const dropdown = page.locator('.input-container').filter({ hasText: /Select Applicable Options/i })
            .or(page.locator('[aria-label*="Select Applicable Options" i]'))
            .or(page.locator('.nexxe-input-wrapper').filter({ hasText: /Select Applicable Options/i }))
            .or(page.getByRole('combobox', { name: /Select Applicable Options/i }))
            .or(page.locator('mat-select[formcontrolname="applicableOptions"]').locator('.mat-select-trigger'))
            .first();

        // The screenshot shows a very specific dropdown box
        const clickTarget = dropdown.locator('.mat-mdc-select-trigger').or(dropdown).first();

        if (await clickTarget.isVisible({ timeout: 10_000 }).catch(() => false)) {
            await clickTarget.click({ force: true });
            await page.waitForTimeout(1000);

            const optionsToSelect = applicableOptions.split(/[,;]/).map(o => o.trim());
            for (const optionText of optionsToSelect) {
                // The screenshot shows options like "Select All", "Addition of new locations or regions", etc.
                const overlay = page.locator('.cdk-overlay-container, .mat-select-panel, .dropdown-menu').last();
                const opt = overlay.getByRole('option', { name: new RegExp(optionText, 'i') })
                    .or(overlay.locator('mat-option').filter({ hasText: new RegExp(optionText, 'i') }))
                    .first();

                if (await opt.isVisible({ timeout: 5_000 }).catch(() => false)) {
                    await opt.click();
                } else {
                    console.log(`Option "${optionText}" not found in list, typing it.`);
                    await page.keyboard.type(optionText);
                    await page.keyboard.press('Enter');
                }
                await page.waitForTimeout(500);
            }
            // Press Escape to close the listbox overlay which might block the "Proceed" button
            await page.keyboard.press('Escape');
            await page.waitForTimeout(500);
        } else {
            console.log("Select Applicable Options dropdown not found or not visible.");
        }
    }

    const proceed = page.getByRole('button', { name: /^proceed with selection$/i }).first();
    await expect(proceed).toBeVisible({ timeout: 60_000 });
    await proceed.click();
}

export async function selectUpdateOptionDropdown(page: Page, option?: string) {
    const v = (option || 'cost efficiency').trim();

    // 1. Ensure the "Update Option(s)" section is expanded if it exists as an accordion.
    const updateOptionsHeading = page.getByRole('heading', { name: /update option\(s\)/i }).first();
    if (await updateOptionsHeading.isVisible().catch(() => false)) {
        const expandBtn = updateOptionsHeading.getByRole('button', { name: /update option\(s\)/i }).first();
        // Check if it has an aria-expanded attribute that is false
        const isExpanded = await expandBtn.getAttribute('aria-expanded').catch(() => null);
        if (isExpanded === 'false' || (await expandBtn.isVisible() && !isExpanded && await expandBtn.locator('img').count() > 0)) {
            // We assume clicking the button expands it
            console.log('Expanding Update Option(s) accordion...');
            await expandBtn.click({ force: true }).catch(() => { });
            await page.waitForTimeout(500);
        }
    }

    // 2. Click the listbox to open it
    const field = page.locator('div[role="listbox"]').filter({ hasText: /Choose Update Option/i })
        .or(page.getByRole('listbox', { name: /Choose Update Option/i }))
        .or(page.locator('[aria-label*="Choose Update Option" i]'))
        .first();

    await expect(field).toBeVisible({ timeout: 60_000 });
    await field.click({ force: true });
    await page.waitForTimeout(1000);

    // 3. Select the option from the listbox overlay
    const overlay = page.locator('.cdk-overlay-container, .mat-select-panel, .dropdown-menu').last();
    const opt = overlay.getByRole('option', { name: new RegExp(v, 'i') })
        .or(overlay.locator('mat-option, .dropdown-item').filter({ hasText: new RegExp(v, 'i') }))
        .or(page.getByRole('option', { name: new RegExp(v, 'i') }))
        .first();

    if (await opt.isVisible({ timeout: 5000 }).catch(() => false)) {
        await opt.click({ force: true });
    } else {
        console.log(`Update Option "${v}" not found in list, typing it.`);
        await page.keyboard.type(v);
        await page.keyboard.press('Enter');
    }
    await page.waitForTimeout(500);

    // Click outside to close the dropdown overlay if it's still open and intercepting clicks
    await page.mouse.click(10, 10);
    await page.waitForTimeout(500);
}

export async function fillBudgetDetailsSequence(page: Page, currency: string, cost: string) {
    const currField = page.locator('[aria-label*="Currency" i], dm-input:has-text("Currency")').first();
    await currField.click();
    await page.waitForTimeout(500);
    const currOpt = page.getByRole('option', { name: new RegExp(currency, 'i') }).first();
    if (await currOpt.isVisible().catch(() => false)) await currOpt.click();
    else { await page.keyboard.type(currency); await page.keyboard.press('Enter'); }

    const costField = page.locator('dm-input:has-text("Estimated Cost") input, [aria-label*="Estimated Cost" i]').first();
    await costField.fill(cost);

    const proceed = page.getByRole('button', { name: /^proceed$/i }).first();
    await proceed.click();
}

export async function selectBudgetApprovalSequence(page: Page, approval: string) {
    const field = page.locator('label:has-text("approval")').locator('xpath=following::*[@role="combobox" or @role="listbox"]').first();
    await field.click();
    const opt = page.getByRole('option', { name: new RegExp(approval, 'i') }).first();
    if (await opt.isVisible().catch(() => false)) await opt.click();
    else { await page.keyboard.type(approval); await page.keyboard.press('Enter'); }
}
