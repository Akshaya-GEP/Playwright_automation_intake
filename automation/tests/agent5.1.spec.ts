import { test } from '../fixtures/testFixtures';
import { workflowAgent5_TC2 } from '../workflows/agent5.1';

test.describe('Agent 5 - Auto invoke', () => {
  test('runs agent 5 workflow', async ({ page, startAutoInvoke }) => {
    test.setTimeout(900_000);
    // Start auto-invoke for agent 5 (index 4)
    await startAutoInvoke(4);

    // Run the Agent 5.1 workflow (test case 2)
    await workflowAgent5_TC2(page, { agentName: 'Agent 5', agentIndex: 4 });
  });
});
