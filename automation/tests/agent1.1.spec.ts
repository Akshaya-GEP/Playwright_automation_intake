import { test } from '../fixtures/testFixtures';
import { workflowAgent1_1 } from '../workflows/agent1.1';

test.describe('Agent 1.1 - Adobe Supplier Offboarding', () => {
  test('runs agent 1.1 workflow', async ({ page, startAutoInvoke }) => {
    // Start auto-invoke for agent 1 (index 0)
    await startAutoInvoke(0);

    // Run the agent-specific workflow
    await workflowAgent1_1(page, { agentName: 'Agent 1', agentIndex: 0 });
  });
});
