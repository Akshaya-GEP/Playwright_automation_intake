import { test } from '../fixtures/testFixtures';
import { workflowAgent2 } from '../workflows/agent2.1';

test.describe('Agent 2 - Auto invoke', () => {
  test('runs agent 2 workflow', async ({ page, startAutoInvoke }) => {
    test.setTimeout(900_000);
    // Start auto-invoke for agent 2 (index 1)
    await startAutoInvoke(1);

    // Run the agent 2.1 workflow (test case 2)
    await workflowAgent2(page, { agentName: 'Agent 2', agentIndex: 1 });
  });
});
