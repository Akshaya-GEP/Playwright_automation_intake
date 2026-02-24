import { test } from '../fixtures/testFixtures';
import { workflowAgent4 } from '../workflows/agent4';
import { getContractExtensionRow } from '../test-data/contractExtensionData';

test.describe('Agent 4 - Contract Extension', () => {
  test('runs contract extension workflow', async ({ page, qubeMeshPage }) => {
    test.setTimeout(900_000);
    // Auto Invoke / agent selection removed: start by typing into "Ask me anything".
    void qubeMeshPage;

    const data = getContractExtensionRow('4');
    const ctx = {
      agentIndex: 3,
      agentName: 'Agent 4',
      isParallel: false
    };
    await workflowAgent4(page, ctx, data);
  });
});