import { test as teardown } from '@playwright/test';
import fs from 'fs';
import { STORAGE_STATE } from '../../playwright.config';

/**
 * Optional global teardown.
 * Cleans up the authentication state file after all tests complete.
 */
teardown('cleanup auth state', async () => {
  // Clean up the auth file if it exists (optional - you may want to keep it for debugging)
  if (fs.existsSync(STORAGE_STATE)) {
    // Uncomment the line below if you want to delete the auth file after tests
    // fs.unlinkSync(STORAGE_STATE);
  }
});
