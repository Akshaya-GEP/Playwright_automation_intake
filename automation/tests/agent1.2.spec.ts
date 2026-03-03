import { test } from '../fixtures/testFixtures';
import { workflowAgent1_2 } from '../workflows/agent1.2';
import { getSupplierOffboardingRow } from '../test-data/supplierOffboardingData';

test.describe('Agent 1.2 - Workday Supplier Offboarding', () => {
  test('runs agent 1.2 workflow', async ({ page, qubeMeshPage }) => {
    // Auto Invoke / agent selection removed: start by typing into "Ask me anything".
    void qubeMeshPage;

    // Run the agent-specific workflow
    const data = getSupplierOffboardingRow('1.2');
    await workflowAgent1_2(page, { agentName: 'Agent 1', agentIndex: 0 }, data);
  });
});

