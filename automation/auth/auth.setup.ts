import { test as setup } from '@playwright/test';
import { LoginPage } from '../pages/loginPage';
import { getEnv, getMissingRequiredEnvVars } from '../utils/env';
import fs from 'fs';
import { dirname } from 'path';
import { STORAGE_STATE, ensureStorageStateFileExists } from '../config/storageState';

const authDir = dirname(STORAGE_STATE);

/**
 * Global authentication setup.
 * Runs once before all tests to authenticate and save the browser storage state.
 * All subsequent tests will reuse this authenticated session.
 */
setup('authenticate', async ({ page }) => {
  const missing = getMissingRequiredEnvVars();
  setup.skip(
    missing.length > 0,
    `Missing required env vars for auth: ${missing.join(', ')}. Create a .env file (see .env.example) before running Playwright.`,
  );

  const env = getEnv();
  const loginPage = new LoginPage(page);

  // Ensure `.auth` dir/state exists at setup time as well.
  ensureStorageStateFileExists();

  // Ensure the .auth directory exists
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // Navigate to the base URL and log in
  await loginPage.goto();
  await loginPage.login(env.userId, env.password);
  await loginPage.assertLoggedIn();

  // Wait for the app to fully load after login (reduced timeout for faster completion)
  await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => {});

  // Save the authenticated state to a file
  await page.context().storageState({ path: STORAGE_STATE });
});
