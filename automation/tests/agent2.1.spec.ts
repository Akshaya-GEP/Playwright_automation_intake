import { test } from '../fixtures/testFixtures';
import { workflowAgent2_1 } from '../workflows/agent2.1';
import { getContractAmendmentRow } from '../test-data/contractAmendmentData';

test.describe('Agent 2 - Auto invoke', () => {
  test('runs agent 2 workflow', async ({ page, qubeMeshPage }) => {
    test.setTimeout(900_000);
    // Auto Invoke / agent selection removed: start by typing into "Ask me anything".
    void qubeMeshPage;

    // Run the agent 2.1 workflow (test case 2)
    await workflowAgent2_1(page, { agentName: 'Agent 2', agentIndex: 1 }, getContractAmendmentRow('2.1'));
  });
});
