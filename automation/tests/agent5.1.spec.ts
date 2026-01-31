import { test, expect } from '../fixtures/testFixtures';
import { runAgentWorkflow } from '../workflows/agentWorkflows';

test.describe('Agent 5 - Auto invoke', () => {
  test('runs agent 5 workflow', async ({ page, startAutoInvoke }) => {
    // Start auto-invoke for agent 5 (index 4)
    await startAutoInvoke(4);

    // Run the agent-specific workflow
    await runAgentWorkflow(page, { agentName: 'Agent 5', agentIndex: 4 });
  });
});
