import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import { STORAGE_STATE, ensureStorageStateFileExists } from './automation/config/storageState';

dotenv.config();

const baseURL = process.env.BASE_URL;
const browserChannel = process.env.PW_BROWSER_CHANNEL || undefined;

// Ensure `.auth` dir/state exists at config load time.
ensureStorageStateFileExists();

export default defineConfig({
  testDir: './automation',
  // Global per-test timeout. Increase if your app loads slowly (SSO, heavy dashboards, etc).
  timeout: 300_000,
  expect: { timeout: 30_000 },
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL,
    ...(browserChannel ? { channel: browserChannel } : {}),
    // Keep default actionTimeout (0 = no limit), but give navigations more room.
    navigationTimeout: 120_000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  projects: [
    // Setup project - runs first to authenticate (no storageState)
    {
      name: 'setup',
      testDir: './automation/auth',
      testMatch: /auth\.setup\.ts/,
    },
    // Main test project - uses authenticated state
    {
      name: 'chromium',
      testDir: './automation/tests',
      use: {
        ...devices['Desktop Chrome'],
        // Use the authenticated state from setup
        storageState: STORAGE_STATE,
      },
      dependencies: ['setup'],
    }
  ]
});
