import { type Page } from '@playwright/test';
import type { AgentContext } from './types';
import { workflowAgent4 } from './agent4';
import { getContractExtensionRow } from '../test-data/contractExtensionData';

/**
 * Wrapper for Agent 4 TC2 to maintain compatibility with legacy tests
 * while using the refactored, shared logic.
 */
export async function workflowAgent4_TC2(page: Page, ctx: AgentContext) {
  // If this is TC2, we usually map it to Sno 4.1 or similar from CSV
  const data = getContractExtensionRow('4.1');
  return await workflowAgent4(page, ctx, data);
}