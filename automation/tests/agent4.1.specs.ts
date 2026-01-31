import { test } from '../fixtures/testFixtures';
import { runAgentWorkflow } from '../workflows/agentWorkflows';
import { getEnv } from '../utils/env';

test.describe('Agent 4 - Contract Extension', () => {
  test('runs contract extension workflow', async ({ page, startAutoInvoke }) => {
    const env = getEnv();

    // 1. Authentication is handled by fixtures (global setup)

    // 2. Start auto-invoke
    // Assuming Agent 4 is at index 3. Adjust if your grid layout differs.
    await startAutoInvoke(3); 

    // 3. Run the agent-specific workflow
    await runAgentWorkflow(page, { 
      agentName: env.agents[3], 
      agentIndex: 3 
    });
  });
});