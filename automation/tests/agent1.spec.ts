import { test } from '../fixtures/testFixtures';
import { getSupplierOffboardingRow } from '../test-data/supplierOffboardingData';
import { workflowAgent1 } from '../workflows/agent1';

test.describe('Agent 1 - Auto invoke', () => {
  test('runs agent 1 workflow', async ({ page, qubeMeshPage }) => {
    // Auto Invoke / agent selection removed: start by typing into "Ask me anything".
    void qubeMeshPage;

    // Run the agent-specific workflow
    const data = getSupplierOffboardingRow('1');
    await workflowAgent1(page, { agentName: 'Agent 1', agentIndex: 0 }, data);
  });
});
