import { test as base, type Page } from '@playwright/test';
import { QubeMeshPage } from '../pages/qubeMeshPage';
import { getEnv, getMissingRequiredEnvVars } from '../utils/env';

/**
 * Extended test fixtures that provide:
 * - `qubeMeshPage`: A QubeMeshPage instance already navigated to the QubeMesh URL
 * - `startAutoInvoke`: (legacy) kept for backward compatibility; it no longer starts Auto Invoke
 */
export type TestFixtures = {
  qubeMeshPage: QubeMeshPage;
  startAutoInvoke: (agentIndex: 0 | 1 | 2 | 3 | 4) => Promise<void>;
};

export const test = base.extend<TestFixtures>({
  /**
   * Provides a QubeMeshPage instance already navigated to the QubeMesh URL.
   * Uses the authenticated session from auth.setup.ts.
   */
  qubeMeshPage: async ({ page }, use, testInfo) => {
    const missing = getMissingRequiredEnvVars();
    if (missing.length) {
      // Skip the test run cleanly instead of failing deep inside setup/workflows.
      // (Login requires these env vars and we can't guess credentials.)
      testInfo.skip(
        true,
        `Missing required env vars: ${missing.join(', ')}. Create a .env file (see .env.example) before running Playwright.`,
      );
    }
    const env = getEnv();
    const qubeMeshPage = new QubeMeshPage(page);
    await qubeMeshPage.goto(env.qubeMeshUrl);
    await use(qubeMeshPage);
  },

  /**
   * Legacy helper kept to avoid updating older specs in bulk.
   *
   * **Behavior change**: this no longer clicks "Auto Invoke" or selects an agent.
   * Workflows should type directly into the "Ask me anything" field.
   */
  startAutoInvoke: async ({ page }, use, testInfo) => {
    const missing = getMissingRequiredEnvVars();
    if (missing.length) {
      testInfo.skip(
        true,
        `Missing required env vars: ${missing.join(', ')}. Create a .env file (see .env.example) before running Playwright.`,
      );
    }
    const env = getEnv();
    const qubeMeshPage = new QubeMeshPage(page);

    // Navigate to QubeMesh
    await qubeMeshPage.goto(env.qubeMeshUrl);

    const startAutoInvokeForAgent = async (agentIndex: 0 | 1 | 2 | 3 | 4) => {
      // Intentionally ignore agentIndex: no auto-invoke, no agent selection.
      void agentIndex;
    };

    await use(startAutoInvokeForAgent);
  },
});

export { expect } from '@playwright/test';

