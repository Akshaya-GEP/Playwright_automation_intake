import type { Page } from '@playwright/test';

import { workflowAgent1 } from './agent1';
import { workflowAgent2 } from './agent2';
import { workflowAgent3 } from './agent3';
import { workflowAgent4 } from './agent4';
import { workflowAgent5 } from './agent5';
import { workflowAgent5_TC2 } from './agent5_1';
import { defaultWorkflow } from './default';
import type { AgentContext } from './types';
import { getSupplierOffboardingRow, type SupplierOffboardingRow } from '../test-data/supplierOffboardingData';
import { getContractAmendmentRow, type ContractAmendmentRow } from '../test-data/contractAmendmentData';
import { workflowAgent2_1 } from './agent2.1';
import { getContractTerminationRow, type ContractTerminationRow } from '../test-data/contractTerminationData';
import { getContractExtensionRow, type ContractExtensionRow } from '../test-data/contractExtensionData';
import { getSupplierProfileUpdateRow, type SupplierProfileUpdateRow } from '../test-data/supplierProfileUpdateData';

export type { AgentContext } from './types';

/**
 * Hook point for agent-specific workflows.
 * Implement the steps for each agent as you describe the rest of the flows.
 */
export async function runAgentWorkflow(page: Page, ctx: AgentContext, data?: any): Promise<any> {
  switch (ctx.agentIndex) {
    case 0:
      // Agent 1 is now data-driven (CSV/feature), so provide CSV defaults if caller doesn't pass data.
      await workflowAgent1(page, ctx, data ?? getSupplierOffboardingRow('1'));
      return;
    case 1:
      // Agent 2 can be 2 or 2.1 depending on context. Default to 2 if not specialized.
      if (ctx.agentName?.includes('2.1')) {
        return workflowAgent2_1(page, ctx, (data as unknown as ContractAmendmentRow) ?? getContractAmendmentRow('2.1'));
      }
      return workflowAgent2(page, ctx, (data as unknown as ContractAmendmentRow) ?? getContractAmendmentRow('2'));
    case 2:
      if (ctx.agentName?.includes('3.1')) {
        return workflowAgent3(page, ctx, (data as unknown as ContractTerminationRow) ?? getContractTerminationRow('3.1'));
      }
      return workflowAgent3(page, ctx, (data as unknown as ContractTerminationRow) ?? getContractTerminationRow('3'));
    case 3:
      return workflowAgent4(page, ctx, (data as unknown as ContractExtensionRow) ?? getContractExtensionRow('4'));
    case 4: {
      const row = (data as unknown as SupplierProfileUpdateRow) ?? getSupplierProfileUpdateRow('5');
      const normalizedSno = String(row?.sno || '').trim();
      if (normalizedSno === '5.1') {
        return workflowAgent5_TC2(page, ctx, row);
      }
      return workflowAgent5(page, ctx,);
    }
    default:
      return defaultWorkflow(page, ctx);
  }
}
