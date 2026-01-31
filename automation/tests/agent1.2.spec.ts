import { test } from '../fixtures/testFixtures';
import { workflowAgent1_2 } from '../workflows/agent1.2';

test.describe('Agent 1.2 - Workday Supplier Offboarding', () => {
  test('runs agent 1.2 workflow', async ({ page, startAutoInvoke }) => {
    // Start auto-invoke for agent 1 (index 0)
    await startAutoInvoke(0);

    // Run the agent-specific workflow
    await workflowAgent1_2(page, { agentName: 'Agent 1', agentIndex: 0 });
  });
});

