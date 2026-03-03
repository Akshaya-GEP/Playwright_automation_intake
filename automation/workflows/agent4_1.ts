import { type Page } from '@playwright/test';
import type { AgentContext } from './types';
import { workflowAgent4 } from './agent4';
import { getContractExtensionRow, type ContractExtensionRow } from '../test-data/contractExtensionData';

/**
 * Agent 4.1 workflow - Contract Extension (Variation)
 */
export async function workflowAgent4_1(page: Page, ctx: AgentContext, data?: ContractExtensionRow) {
    return workflowAgent4(page, ctx, data ?? getContractExtensionRow('4.1'));
}
