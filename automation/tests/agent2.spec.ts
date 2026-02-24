import { test } from '../fixtures/testFixtures';
import { runAgentWorkflow } from '../workflows/agentWorkflows';

test.describe('Agent 2 - Auto invoke', () => {
  test('runs agent 2 workflow', async ({ page, qubeMeshPage }) => {
    test.setTimeout(900_000);
    // Auto Invoke / agent selection removed: start by typing into "Ask me anything".
    void qubeMeshPage;

    // Run the agent-specific workflow
    await runAgentWorkflow(page, { agentName: 'Agent 2', agentIndex: 1 });
  });
});
