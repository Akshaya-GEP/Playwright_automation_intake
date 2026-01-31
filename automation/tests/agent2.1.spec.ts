import { test, expect } from '../fixtures/testFixtures';
import { runAgentWorkflow } from '../workflows/agentWorkflows';

test.describe('Agent 2 - Auto invoke', () => {
  test('runs agent 2 workflow', async ({ page, startAutoInvoke }) => {
    // Start auto-invoke for agent 2 (index 1)
    await startAutoInvoke(1);

    // Run the agent-specific workflow
    await runAgentWorkflow(page, { agentName: 'Agent 2', agentIndex: 1 });
  });
});
