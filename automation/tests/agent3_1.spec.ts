import { test } from '../fixtures/testFixtures';
import { workflowAgent3_1 } from '../workflows/agent3_1';

test.describe('Agent 3.1 - Auto invoke (Terminate Immediately)', () => {
  test('runs agent 3.1 workflow - terminate immediately', async ({ page, qubeMeshPage }) => {
    // Auto Invoke / agent selection removed: start by typing into "Ask me anything".
    void qubeMeshPage;

    // Run the Agent 3.1 workflow (terminate immediately, skips date selection)
    await workflowAgent3_1(page, { agentName: 'Agent 3', agentIndex: 2 });
  });
});
