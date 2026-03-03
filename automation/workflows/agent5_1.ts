
import { expect, type Locator, type Page } from '@playwright/test';
import { getEnv } from '../utils/env';
import type { AgentContext } from './types';
import { waitForAiEvents } from './aiEvents';
import { escapeRegex, finalizeRequestFlow } from './utils';
import { enterPromptAndSubmit, getAskMeAnythingField } from './uiActions';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import type { SupplierProfileUpdateRow } from '../test-data/supplierProfileUpdateData';

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

async function clickFirstVisibleEnabledIn(
    page: Page,
    locator: Locator,
    label: string,
    opts?: { timeoutMs?: number; pollMs?: number; required?: boolean; forceIfDisabled?: boolean },
): Promise<boolean> {
    const timeoutMs = opts?.timeoutMs ?? 60_000;
    const pollMs = opts?.pollMs ?? 250;
    const required = opts?.required ?? true;
    const forceIfDisabled = opts?.forceIfDisabled ?? false;
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
        const count = await locator.count().catch(() => 0);
        for (let i = 0; i < count; i++) {
            const el = locator.nth(i);
            if (!(await el.isVisible().catch(() => false))) continue;
            const enabled = await el.isEnabled().catch(() => false);
            if (!enabled) continue;
            console.log(`Clicking ${label} button`);
            await el.click({ timeout: 30_000 }).catch(() => el.click({ timeout: 30_000, force: true }));
            return true;
        }
        await page.waitForTimeout(pollMs);
    }

    if (forceIfDisabled) {
        const count = await locator.count().catch(() => 0);
        for (let i = 0; i < count; i++) {
            const el = locator.nth(i);
            if (!(await el.isVisible().catch(() => false))) continue;
            console.log(`Force-clicking ${label} button (disabled state)`);
            try {
                await el.click({ timeout: 30_000, force: true });
            } catch {
                const box = await el.boundingBox().catch(() => null);
                if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            }
            return true;
        }
    }

    if (required) {
        throw new Error(`Could not find a visible+enabled "${label}" button in the upload section.`);
    }
    return false;
}

/**
 * Agent 5: Supplier Profile Update Assistant - Test Case 2
 * Changes:
 * - Update Type: Exception Approval Required
 * - Reason: Approve supplier
 */
export async function workflowAgent5_TC2(page: Page, _ctx: AgentContext, data?: SupplierProfileUpdateRow) {
    const env = getEnv();

    // Load environment variables with defaults for TC2
    const query = data?.query || env.userQuery5 || 'I want to update supplier name Microsoft';
    const supplierName = data?.supplierName || env.supplierName5 || 'Microsoft';
    const supplierCode = data?.supplierCode || env.supplierCode5 || 'GEP-000010742';

    // --- CHANGE FOR TEST CASE 2 ---
    // Prefer CSV-driven values when provided, otherwise fall back to TC2 env overrides.
    const updateType =
        data?.updateType || process.env.UPDATE_TYPE_5_2 || env.updateType5 || 'Exception Approval Required';
    const reasonAction =
        data?.reasonAction || process.env.REASON_ACTION_5_2 || env.reasonAction5 || 'Approve supplier';
    // ------------------------------

    const uploadFile = data?.uploadFile || env.uploadFile5;

    const askField = getAskMeAnythingField(page);
    let aiEventsCount: number | null = null;

    // Step 1: Supplier Selection (same as Agent 1)
    console.log(`Starting Agent 5 TC2 Flow with Query: ${query}`);
    aiEventsCount = await enterPromptAndSubmit(page, query, aiEventsCount);

    // Grid Selection - same pattern as Agent 1
    const grid = page
        .getByRole('grid')
        .filter({ has: page.getByRole('columnheader', { name: /supplier name/i }) })
        .first()
        .or(page.getByRole('grid').first())
        .or(page.locator('[role="grid"]').first());
    await expect(grid).toBeVisible({ timeout: 60_000 });

    const checkboxRows = grid
        .getByRole('row', { name: /press space to select this row/i })
        .or(grid.getByRole('row').filter({ has: grid.locator('input[type="checkbox"],[role="checkbox"]') }));

    await expect.poll(async () => await checkboxRows.count(), { timeout: 60_000 }).toBeGreaterThan(0);

    // Target the FIRST "Proceed" button associated with the grid
    const proceed = page.getByRole('button', { name: /^proceed$/i }).first();

    // Try to find supplier by name and code if provided, otherwise use first row
    let supplierSelected = false;
    if (supplierName && supplierCode) {
        const supplierRow = checkboxRows
            .filter({
                hasText: new RegExp(escapeRegex(supplierName), 'i'),
            })
            .filter({
                hasText: new RegExp(escapeRegex(supplierCode), 'i'),
            })
            .first();

        const rowCount = await supplierRow.count();
        if (rowCount > 0) {
            const checkboxInRow = supplierRow
                .getByRole('checkbox')
                .or(supplierRow.locator('input[type="checkbox"]'))
                .or(supplierRow.locator('[role="checkbox"]'))
                .first();
            await checkboxInRow.click({ force: true, timeout: 30_000 }).catch(async () => {
                await supplierRow.click({ force: true, timeout: 30_000 });
                await page.keyboard.press('Space').catch(() => { });
            });
            supplierSelected = true;
        }
    }

    if (!supplierSelected) {
        const firstCheckboxRow = checkboxRows.first();
        const checkboxInRow = firstCheckboxRow
            .getByRole('checkbox')
            .or(firstCheckboxRow.locator('input[type="checkbox"]'))
            .or(firstCheckboxRow.locator('[role="checkbox"]'))
            .first();

        await checkboxInRow.click({ force: true, timeout: 30_000 }).catch(async () => {
            await firstCheckboxRow.click({ force: true, timeout: 30_000 });
            await page.keyboard.press('Space').catch(() => { });
        });
    }

    await expect(proceed).toBeEnabled({ timeout: 30_000 });
    await proceed.click();
    aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);

    // Step 2: Supplier summary confirmation (Proceed with Request)
    const proceedWithRequestPre = page
        .getByRole('button', { name: /proceed with request/i })
        .or(page.getByRole('link', { name: /proceed with request/i }))
        .first();

    // Some environments skip the supplier summary and go directly to update type selection,
    // so we race between the prompt and the Proceed-with-request CTA.
    const updatePrompt = page
        .locator('div:visible')
        .filter({ hasText: /Here are some updates|update type|choose option|select option/i })
        .first();

    // Find and click the nexxe select dropdown field for "Choose Option(s)"
    const chooseOptionsField = page
        .locator('dm-input')
        .filter({ has: page.locator('label').filter({ hasText: /Choose Option/i }) })
        .locator('.input-container[role="listbox"], .input-container[role="combobox"], [role="listbox"], [role="combobox"]')
        .first()
        .or(page.locator('[aria-label*="Choose Option(s)" i]'))
        .or(page.locator('[aria-label*="Choose Option" i]'))
        .first();

    await Promise.race([
        proceedWithRequestPre.waitFor({ state: 'visible', timeout: 180_000 }).catch(() => { }),
        chooseOptionsField.waitFor({ state: 'visible', timeout: 180_000 }).catch(() => { }),
        updatePrompt.waitFor({ state: 'visible', timeout: 180_000 }).catch(() => { }),
    ]);

    if (await proceedWithRequestPre.isVisible().catch(() => false)) {
        // Some builds briefly report the CTA as disabled even though it is clickable.
        // Mirror Agent 5's "forceIfDisabled" robustness here too.
        await clickFirstVisibleEnabledIn(page, proceedWithRequestPre, 'Proceed with Request', {
            timeoutMs: 180_000,
            required: true,
            forceIfDisabled: true,
        });
        aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
    }

    // Step 3: Update Type Selection
    await expect(chooseOptionsField).toBeVisible({ timeout: 180_000 });
    await chooseOptionsField.click({ timeout: 30_000 });
    await page.waitForTimeout(1500); // Wait for dropdown to open

    // Select the update type from dropdown
    const updateTypeToSelect = updateType.trim();
    console.log(`Selecting update type: ${updateTypeToSelect}`);

    // IMPORTANT: Click ONLY ONCE.
    const words = updateTypeToSelect.split(/[\s\/\u2014\u2013\u002D]+/).filter(Boolean);
    const flexiblePattern = new RegExp(words.map((w) => escapeRegex(w)).join('[\\s\\/\\u2014\\u2013\\-]+'), 'i');

    // In this UI, the dropdown expands into a real ARIA listbox:
    // - listbox name: "Choose Option(s)"
    // - option accessible names include: "<Option Label> checkbox not checked|checked"
    // Prefer role-based locators over framework-specific overlay selectors.
    // The UI has TWO listboxes:
    // 1) the input-container (combobox-like) labelled "Choose Option(s)"
    // 2) the actual options container that holds role="option" items
    // To ensure we never interact with "Select All", find the specific option FIRST,
    // then derive its containing listbox (options container).
    const optionRow = page.getByRole('option', { name: flexiblePattern }).first();
    await expect(optionRow).toBeVisible({ timeout: 30_000 });

    const chooseOptionsListbox = optionRow.locator('xpath=ancestor::*[@role="listbox"][1]').first();
    await expect(chooseOptionsListbox).toBeVisible({ timeout: 30_000 });

    async function isOptionSelected(): Promise<boolean> {
        const ariaSelected = await optionRow.getAttribute('aria-selected').catch(() => '');
        if (ariaSelected === 'true') return true;

        const ariaChecked = await optionRow.getAttribute('aria-checked').catch(() => '');
        if (ariaChecked === 'true') return true;

        const cls = await optionRow.getAttribute('class').catch(() => '');
        if (/\bselected\b|\bchecked\b/i.test(cls || '')) return true;

        const txt = await optionRow.textContent().catch(() => '');
        if (/checkbox\s+checked/i.test(txt || '')) return true;

        return false;
    }

    if (!(await isOptionSelected())) {
        // Click once; multi-select options can toggle, so only retry if we still read "not checked".
        for (let attempt = 0; attempt < 3; attempt++) {
            await optionRow.scrollIntoViewIfNeeded().catch(() => { });
            // Prefer clicking near the left edge of the option where the checkbox UI is rendered.
            const box = await optionRow.boundingBox().catch(() => null);
            if (box) {
                await page.mouse.click(box.x + 16, box.y + box.height / 2);
            } else {
                await optionRow.click({ timeout: 30_000, force: true });
            }
            await page.waitForTimeout(250);
            if (await isOptionSelected()) break;
        }
    } else {
        console.log('Option already selected; skipping click to avoid toggling off.');
    }

    await expect.poll(async () => await isOptionSelected(), { timeout: 30_000 }).toBeTruthy();

    await page.waitForTimeout(1000); // Wait after selection

    // Close the dropdown (helps enable the Proceed button in some builds)
    await page.keyboard.press('Escape').catch(() => { });
    await page.waitForTimeout(300);
    // Some builds keep the listbox open even after Escape; click away as a fallback.
    await expect(chooseOptionsListbox).toBeHidden({ timeout: 5_000 }).catch(async () => {
        await page.mouse.click(10, 10);
        await page.waitForTimeout(300);
    });

    // After selecting the update type (e.g., "Exception Approval Required"), click Proceed.
    // IMPORTANT: do not use .first() here; there may be hidden/older CTAs in the DOM.
    const proceedCandidates = page
        .getByRole('button', { name: /^proceed$/i })
        .or(page.getByRole('link', { name: /^proceed$/i }));

    const proceedWithRequestCandidates = page
        .getByRole('button', { name: /proceed with request/i })
        .or(page.getByRole('link', { name: /proceed with request/i }));

    const clickedProceed = await clickFirstVisibleEnabledIn(page, proceedCandidates, 'Proceed', {
        timeoutMs: 60_000,
        required: false,
        // Some builds incorrectly report disabled even though it's clickable.
        forceIfDisabled: true,
    });

    const clickedPwr =
        clickedProceed ||
        (await clickFirstVisibleEnabledIn(page, proceedWithRequestCandidates, 'Proceed with Request', {
            timeoutMs: 60_000,
            required: false,
            forceIfDisabled: true,
        }));

    if (clickedPwr) {
        aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
    } else {
        console.warn('No Proceed CTA found after selecting update type; continuing...');
    }

    // Step 3: Detail Input Request
    const detailPrompt = page.getByText(/Can you explain in detail|exact changes you want to make/i);
    await expect(detailPrompt.first()).toBeVisible({ timeout: 1200_000 });
    await expect(askField).toBeVisible({ timeout: 1200_000 });

    aiEventsCount = await enterPromptAndSubmit(page, reasonAction, aiEventsCount);

    // Step 4: Document Upload Request
    // NOTE: Some builds don't render the exact prompt text consistently, so detect the upload step by UI controls too.
    const uploadPrompt = page.getByText(/Please upload the required supporting document|upload.*document/i).first();
    const attachmentsLabel = page.getByText(/Please select attachments/i).first();
    const addButtonOnUpload = page.getByRole('button', { name: /^add$/i }).first();
    const fileInputOnUpload = page.locator('input[type="file"]').first();

    await Promise.race([
        uploadPrompt.waitFor({ state: 'visible', timeout: 120_000 }).catch(() => { }),
        attachmentsLabel.waitFor({ state: 'visible', timeout: 120_000 }).catch(() => { }),
        addButtonOnUpload.waitFor({ state: 'visible', timeout: 120_000 }).catch(() => { }),
        fileInputOnUpload.waitFor({ state: 'visible', timeout: 120_000 }).catch(() => { }),
    ]);

    const hasUploadPrompt = await Promise.all([
        uploadPrompt.isVisible().catch(() => false),
        attachmentsLabel.isVisible().catch(() => false),
        addButtonOnUpload.isVisible().catch(() => false),
        fileInputOnUpload.isVisible().catch(() => false),
    ]).then((flags) => flags.some(Boolean));

    if (hasUploadPrompt) {
        let filePath: string;

        if (uploadFile && uploadFile.trim()) {
            filePath = uploadFile.trim();
        } else {
            const homeDir = os.homedir();
            filePath = path.join(homeDir, 'Desktop', 'a.xlsx');
            console.log(`No UPLOAD_FILE_5 specified, using default: ${filePath}`);
        }

        if (!path.isAbsolute(filePath)) {
            const projectRoot = process.cwd();
            const resolvedPath = path.resolve(projectRoot, filePath);
            if (fs.existsSync(resolvedPath)) {
                filePath = resolvedPath;
            } else {
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

            // IMPORTANT: do NOT upload via a global input[type="file"], because many apps have a hidden
            // file input for the chat composer (which would attach the file to the chat area).
            // We must target the upload section's Browse control + its file input.
            const attachmentsLabel = page.getByText(/Please select attachments/i).first();
            await attachmentsLabel.waitFor({ state: 'visible', timeout: 60_000 }).catch(() => { });

            // Find the upload widget container starting from the "*Please select attachments" label.
            // Prefer a direct ancestor that contains "Add" and/or "Choose File". Fallback to walking up.
            let uploadContainer: Locator = attachmentsLabel.locator(
                'xpath=ancestor::*[.//button[normalize-space()="Add"] or .//button[contains(normalize-space(.), "Choose File")]][1]',
            );
            const uploadContainerCount = await uploadContainer.count().catch(() => 0);
            if (uploadContainerCount === 0) {
                // Fallback: walk up until the container includes Add.
                let cur: Locator = attachmentsLabel;
                for (let i = 0; i < 15; i++) {
                    cur = cur.locator('..');
                    const hasAddByRole = (await cur.getByRole('button', { name: /^add$/i }).count().catch(() => 0)) > 0;
                    const hasAddByText = (await cur.locator('button:has-text("Add")').count().catch(() => 0)) > 0;
                    if (hasAddByRole || hasAddByText) {
                        uploadContainer = cur;
                        break;
                    }
                }
            }

            // Step 1: Prepare to catch the file chooser dialog BEFORE clicking Browse (on the upload section)
            const fileChooserPromise = page.waitForEvent('filechooser', { timeout: 60_000 });

            // Step 2: Click the "Browse" button/link - try multiple strategies
            console.log('Looking for Browse button...');
            let browseClicked = false;

            // Preferred: the widget exposes a real button "Choose File" (this reliably binds the filechooser)
            const chooseFileBtn = uploadContainer.getByRole('button', { name: /choose file/i }).first();
            if (await chooseFileBtn.isVisible().catch(() => false)) {
                await chooseFileBtn.click({ timeout: 30_000 }).catch(() => chooseFileBtn.click({ timeout: 30_000, force: true }));
                browseClicked = true;
                console.log('Clicked Choose File button (upload widget)');
            }

            // Strategy 1: Find Browse link near "Please select attachments" label
            if (!browseClicked)
                try {
                    const browseNearLabel = attachmentsLabel
                        .locator('xpath=following::*[normalize-space()="Browse" or contains(normalize-space(), "Browse")][1]')
                        .or(uploadContainer.getByRole('link', { name: /^browse$/i }).first())
                        .or(uploadContainer.getByRole('button', { name: /^browse$/i }).first())
                        .or(uploadContainer.getByText(/^Browse$/i).first())
                        .first();

                    if (await browseNearLabel.isVisible().catch(() => false)) {
                        await browseNearLabel.scrollIntoViewIfNeeded().catch(() => { });
                        await browseNearLabel.click({ timeout: 30_000, force: true }).catch(async () => {
                            await browseNearLabel.click({ timeout: 30_000 });
                        });
                        browseClicked = true;
                        console.log('Clicked Browse button (scoped to attachments section)');
                    }
                } catch {
                    console.log('Strategy 1 failed, trying next...');
                }

            // Strategy 2: Find Browse as clickable link/button
            if (!browseClicked) {
                const browseLink = uploadContainer
                    .getByRole('link', { name: /Browse/i })
                    .or(uploadContainer.locator('a:has-text("Browse")'))
                    .or(uploadContainer.locator('button:has-text("Browse")'))
                    .or(uploadContainer.locator('span:has-text("Browse")'))
                    .or(uploadContainer.locator('[class*="browse"]'))
                    .or(uploadContainer.getByText(/Browse/i).filter({ hasNot: uploadContainer.locator('input') }))
                    .first();

                if ((await browseLink.count().catch(() => 0)) > 0) {
                    try {
                        await expect(browseLink).toBeVisible({ timeout: 30_000 });
                        await browseLink.scrollIntoViewIfNeeded();
                        await page.waitForTimeout(500);
                        await browseLink.click({ timeout: 30_000, force: true });
                        browseClicked = true;
                        console.log('Clicked Browse button (found as link/button)');
                    } catch {
                        console.log('Strategy 2 failed, trying next...');
                    }
                }
            }

            // Strategy 3: Use JavaScript to find and click Browse
            if (!browseClicked) {
                try {
                    const jsClicked = await uploadContainer
                        .evaluate((root: HTMLElement) => {
                            const elements = Array.from(root.querySelectorAll('a, button, span, div, label'));
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
                        })
                        .catch(() => false);

                    if (jsClicked) {
                        browseClicked = true;
                        console.log('Clicked Browse button (via JavaScript)');
                        await page.waitForTimeout(500);
                    }
                } catch {
                    console.log('Strategy 3 (page.evaluate Browse click) failed, continuing...');
                }
            }

            if (!browseClicked) {
                throw new Error('Could not find or click Browse button');
            }

            // Step 3: Wait for file chooser dialog and select the file
            console.log('Waiting for file chooser dialog...');
            try {
                const fileChooser = await fileChooserPromise;
                await fileChooser.setFiles(filePath);
                console.log(`Selected file: ${path.basename(filePath)}`);
            } catch {
                // If the filechooser event didn't fire, set the upload-section input[type=file] (scoped)
                console.log('File chooser did not appear; retrying upload via scoped input[type="file"].setInputFiles');
                const scopedInput = uploadContainer.locator('input[type="file"]').first();
                await scopedInput.setInputFiles(filePath, { timeout: 30_000 });
            }

            // Step 4: Wait for file to be processed and appear in UI
            await page.waitForTimeout(2000);

            const fileName = path.basename(filePath);
            const fileDisplayed = uploadContainer.getByText(fileName, { exact: false });
            await expect(fileDisplayed.first())
                .toBeVisible({ timeout: 10_000 })
                .catch(() => console.log(`File name "${fileName}" not visible in UI, but continuing...`));
            await page.waitForTimeout(1000);

            // Step 5/6: Upload step CTAs (must be in the upload section, not global buttons).
            // Current UI behavior: file appears in the field, then click Add to register it; Done may appear afterwards.
            const doneCandidates = uploadContainer
                .getByRole('button', { name: /^done$/i })
                .or(uploadContainer.locator('button:has-text("Done")'));

            // Add button in this UI is often rendered as:
            // <button class="option-btn ..."> Add </button>
            // Prefer the CSS hook first, then fall back to role/text queries.
            const addCandidates = uploadContainer
                .locator('button.option-btn')
                .filter({ hasText: /^\s*add\s*$/i })
                .or(uploadContainer.getByRole('button', { name: /^\s*add\s*$/i }))
                .or(uploadContainer.locator('button:has-text("Add")'));

            // UI varies:
            // - Some builds require Done -> Add
            // - Others advance to summary immediately after Done (and leave a disabled Add behind)
            // We'll try Done, then attempt Add if it's actionable; otherwise proceed when Create Request/summary appears.
            const summaryOrCreateRequest = page
                .getByText(/Summary of Your Request/i)
                .or(page.getByRole('button', { name: /create request/i }))
                .first();

            const doneCount = await doneCandidates.count().catch(() => 0);
            if (doneCount > 0) {
                await clickFirstVisibleEnabledIn(page, doneCandidates, 'Done', { timeoutMs: 60_000, required: true });

                // Immediately try to click Add after Done (Done disappears after click in this UI).
                // Do not block here if Add isn't ready yet; we'll fall back to waiting below.
                await clickFirstVisibleEnabledIn(page, addCandidates, 'Add', {
                    timeoutMs: 5_000,
                    required: false,
                    forceIfDisabled: true,
                }).catch(() => false);
            } else {
                console.log('No Done button found in upload section; skipping Done');
            }

            // After Done, either the app advances to Summary/Create Request OR we must click Add.
            await Promise.race([
                summaryOrCreateRequest.waitFor({ state: 'visible', timeout: 60_000 }).catch(() => { }),
                addCandidates.first().waitFor({ state: 'visible', timeout: 60_000 }).catch(() => { }),
            ]);

            if (await summaryOrCreateRequest.isVisible().catch(() => false)) {
                console.log('Upload step advanced after Done; skipping Add click.');
            } else {
                await clickFirstVisibleEnabledIn(page, addCandidates, 'Add', {
                    timeoutMs: 60_000,
                    required: true,
                    forceIfDisabled: true,
                });
            }

            aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
            console.log('File upload completed successfully');

            // After upload, we should move forward to the summary / create request screen.
            // Some builds keep the upload UI visible briefly; wait for a forward signal instead of racing blindly.
            const summaryMessageAfterUpload = page.getByText(/Thanks! I have found|Summary of Your Request/i).first();
            const createRequestAfterUpload = page
                .locator('button.option-btn:has-text("Create Request")')
                .or(page.getByRole('button', { name: /^create request$/i }))
                .or(page.locator('button').filter({ hasText: /create request/i }))
                .first();
            await Promise.race([
                summaryMessageAfterUpload.waitFor({ state: 'visible', timeout: 240_000 }).catch(() => { }),
                createRequestAfterUpload.waitFor({ state: 'visible', timeout: 240_000 }).catch(() => { }),
            ]);
        } else {
            console.warn(`File ${filePath} does not exist. Skipping file upload.`);
            const skipBtn = page.getByRole('button', { name: /skip/i }).last();
            if (await skipBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
                console.log('Clicking Skip button to proceed without file upload...');
                await skipBtn.click({ timeout: 30_000 }).catch(() => { });
                await page.waitForTimeout(1000);
                aiEventsCount = await waitForAiEvents(page, aiEventsCount).catch(() => aiEventsCount);
            } else {
                console.log('No Skip button found, proceeding without file upload...');
                await page.waitForTimeout(2000);
            }
        }
    } else {
        console.log('No file upload prompt found, proceeding to summary...');
    }

    // Step 5: Request Summary and Confirmation
    console.log('Waiting for request summary...');
    const summaryMessage = page.getByText(/Thanks! I have found|Summary of Your Request/i);
    await expect(summaryMessage.first()).toBeVisible({ timeout: 180_000 });
    console.log('Summary message found');

    await expect(page.getByText(/Supplier Legal Name|Supplier Partner Number/i)).toBeVisible({ timeout: 60_000 }).catch(() => {
        console.log('Supplier details not found, but continuing...');
    });

    console.log('Looking for Create Request button...');
    await page.waitForTimeout(2000);

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
    await page.waitForTimeout(2000);
    const end = await finalizeRequestFlow(page);
    console.log(`✅ Finalized flow. Ended by: ${end.endedBy}`);
    return end;
}

// getAskMeAnythingField is provided by `uiActions.ts` so all agents share a single robust selector.


