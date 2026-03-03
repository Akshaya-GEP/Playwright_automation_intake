import { test } from '../fixtures/testFixtures';
import { workflowAgent3 } from '../workflows/agent3';
import { getContractTerminationRow } from '../test-data/contractTerminationData';

test.describe('Agent 3 - Future Date Termination', () => {
  test('runs agent 3 workflow', async ({ page, qubeMeshPage }) => {
    test.setTimeout(900_000);
    // Auto Invoke / agent selection removed: start by typing into "Ask me anything".
    void qubeMeshPage;

    const data = getContractTerminationRow('3');
    const ctx = {
      agentIndex: 2,
      agentName: 'Agent 3',
      isParallel: false
    };
    await workflowAgent3(page, ctx, data);
  });
});
