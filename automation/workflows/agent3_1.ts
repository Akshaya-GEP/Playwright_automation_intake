import { type Page } from '@playwright/test';
import type { AgentContext } from './types';
import { workflowAgent3 } from './agent3';
import { getContractTerminationRow, type ContractTerminationRow } from '../test-data/contractTerminationData';

/**
 * Agent 3.1 workflow - Terminate Immediately
 * Now just a wrapper around workflowAgent3 with 3.1 data by default.
 */
export async function workflowAgent3_1(page: Page, ctx: AgentContext, data?: ContractTerminationRow) {
  return workflowAgent3(page, ctx, data ?? getContractTerminationRow('3.1'));
}
