import { expect, type Locator, type Page } from '@playwright/test';
import { escapeRegex } from './utils';
import { waitForAiEvents } from './aiEvents';
import { clickYesForQuestion, clickProceedIfPresent } from './uiActions';

/**
 * Shared actions for Contract Amendment agents.
 */

export function getAmendmentReasonListbox(page: Page): Locator {
    const labelText = /amendment reason/i;
    // Matching exactly the user's provided working locator
    const listboxByAttrs = page.locator('div[role="listbox"][aria-label="Amendment Reason"]').first();
    const listboxByRole = page.getByRole('listbox', { name: labelText }).first();
    return listboxByAttrs.or(listboxByRole);
}

export function dropdownPanel(page: Page): Locator {
    return page.locator('.cdk-overlay-pane:visible, .mat-select-panel:visible, .dropdown-menu:visible').first();
}

export function dropdownOptionCandidates(page: Page): Locator {
    const panel = dropdownPanel(page);
    const selectors = '[role="option"], mat-option, [role="menuitem"], [role="checkbox"], .mat-option, .dropdown-item, li, input[type="checkbox"]';
    const panelCandidates = panel.locator(selectors);

    const inlineListbox = page.locator('div[role="listbox"][aria-label="Amendment Reason"]').first();
    const inlineCandidates = inlineListbox.locator(selectors);

    return panelCandidates.or(inlineCandidates);
}

export async function waitForDropdownToShow(page: Page) {
    console.log('Waiting for dropdown options to be visible...');
    await expect
        .poll(async () => {
            const count = await dropdownOptionCandidates(page).count();
            if (count > 0) console.log(`Found ${count} dropdown option candidates.`);
            return count;
        }, { timeout: 60_000, message: 'Timed out waiting for dropdown options to appear. Check if dropdown opened correctly.' })
        .toBeGreaterThan(0);
}

export async function waitForDropdownLoadingToFinish(page: Page) {
    const loader = page
        .getByRole('progressbar')
        .or(page.locator('[aria-busy="true"]'))
        .or(page.locator('.spinner, .loading, .loader, .mat-progress-spinner, .mat-spinner, .cdk-overlay-backdrop'));

    const appeared = await loader.first().isVisible().catch(() => false);
    if (!appeared) return;

    await expect(loader.first()).toBeHidden({ timeout: 60_000 });
}

export async function forceClickChevronNTimes(page: Page, field: Locator, clicks: number) {
    for (let i = 0; i < clicks; i++) {
        const box = await field.boundingBox().catch(() => null);
        if (box) {
            const x = box.x + box.width - 12;
            const y = box.y + box.height / 2;
            await page.mouse.click(x, y);
        } else {
            await field.click({ timeout: 30_000 }).catch(() => { });
        }
        await page.waitForTimeout(150);
    }
}

export async function openAmendmentReasonDropdown(page: Page, field: Locator) {
    const maxAttempts = 6;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        await forceClickChevronNTimes(page, field, 1);
        await page.keyboard.press('Enter').catch(() => { });

        await waitForDropdownLoadingToFinish(page).catch(() => { });
        await forceClickChevronNTimes(page, field, 1);

        const count = await dropdownOptionCandidates(page).count().catch(() => 0);
        if (count > 0) return;

        await page.waitForTimeout(350);
    }

    await waitForDropdownToShow(page);
}

export async function clickDropdownOptionByIndex(page: Page, index: number) {
    await waitForDropdownToShow(page);
    const inlineListbox = page.locator('div[role="listbox"][aria-label="Amendment Reason"]').first();
    const inlineOptions = inlineListbox.locator('[role="option"], mat-option, .mat-option, .dropdown-item, li, [role="checkbox"], input[type="checkbox"]');
    const inlineCount = await inlineOptions.count();
    if (inlineCount === 0) {
        throw new Error('Dropdown options not found after opening Amendment Reason dropdown.');
    }

    const pick = inlineOptions.nth(Math.min(index, inlineCount - 1));
    await pick.click({ timeout: 30_000 });
}

export async function clickDropdownOptionByText(page: Page, text: string | RegExp) {
    const isRegExp = text instanceof RegExp;
    const matchValue = isRegExp ? text : new RegExp(escapeRegex(String(text).trim()), 'i');

    if (!isRegExp && !String(text).trim()) throw new Error('clickDropdownOptionByText: empty text');

    await waitForDropdownToShow(page);

    const panel = dropdownPanel(page);
    const panelOptions = panel.locator('[role="option"], mat-option, .mat-option, .dropdown-item, li');
    const panelMatch = panelOptions.filter({ hasText: matchValue }).first();
    if (await panelMatch.count()) {
        await panelMatch.click({ timeout: 30_000 });
        return;
    }

    const inlineListbox = page.locator('div[role="listbox"][aria-label="Amendment Reason"]').first();
    const inlineOptions = inlineListbox.locator('[role="option"], mat-option, .mat-option, .dropdown-item, li, [role="checkbox"], input[type="checkbox"]');
    const inlineMatch = inlineOptions.filter({ hasText: matchValue }).first();
    if (await inlineMatch.count()) {
        await inlineMatch.click({ timeout: 30_000 });
        return;
    }

    throw new Error(`Amendment Reason option not found for: "${text}"`);
}

export async function clickAmendmentReason(page: Page, reasonAmend?: string) {
    const v = (reasonAmend || '').trim();
    if (!v) { await clickDropdownOptionByIndex(page, 1); return; }
    if (/^\d+$/.test(v)) { await clickDropdownOptionByIndex(page, parseInt(v, 10)); return; }

    try { await clickDropdownOptionByText(page, v); return; } catch (e) { console.log(`Exact match failed for "${v}". Trying mappings...`); }

    const lower = v.toLowerCase();
    const mappings: RegExp[] = [];
    if (lower.includes('terms') || lower.includes('condition')) mappings.push(/agreement\s+to\s+change\s+terms/i, /change\s+in\s+terms/i, /contract\s+terms/i);
    if (lower.includes('payment')) mappings.push(/change\s+in\s+payment\s+terms/i, /payment\s+terms/i);
    if (lower.includes('location') || lower.includes('region')) mappings.push(/addition\s+of\s+new\s+locations/i, /new\s+locations/i, /region/i);
    if (lower.includes('party') || lower.includes('parties')) mappings.push(/addition\s+or\s+removal\s+of\s+parties/i, /removal\s+of\s+parties/i, /parties/i);
    if (lower.includes('supplier')) mappings.push(/change\s+in\s+supplier\s+entity/i, /ownership/i, /supplier/i);
    if (lower.includes('compliance') || lower.includes('legal')) mappings.push(/compliance\s+or\s+legal/i, /legal\s+requirement/i);

    for (const re of mappings) { try { await clickDropdownOptionByText(page, re); return; } catch { } }
    console.log(`Fallback to 2nd option for "${v}"`);
    await clickDropdownOptionByIndex(page, 1);
}

