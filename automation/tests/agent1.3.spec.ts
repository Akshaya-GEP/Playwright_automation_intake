import { test } from '../fixtures/testFixtures';
import { workflowAgent1_3 } from '../workflows/agent1.3';

test.describe('Agent 1.3 - Supplier Offboarding (by Identification Number)', () => {
  test('runs agent 1.3 workflow', async ({ page, startAutoInvoke }) => {
    // Start auto-invoke for agent 1 (index 0)
    await startAutoInvoke(0);

    // Run the agent-specific workflow
    await workflowAgent1_3(page, { agentName: 'Agent 1', agentIndex: 0 });
  });
});


