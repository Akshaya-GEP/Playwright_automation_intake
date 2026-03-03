import { test } from '../fixtures/testFixtures';
import { workflowAgent4_TC2 } from '../workflows/agent4.1';
import { getEnv } from '../utils/env';

test.describe('Agent 4 - Contract Extension', () => {
  test('runs contract extension workflow', async ({ page, qubeMeshPage }) => {
    test.setTimeout(900_000);
    const env = getEnv();

    // 1. Authentication is handled by fixtures (global setup)

    // 2. Auto Invoke / agent selection removed: start by typing into "Ask me anything".
    void qubeMeshPage;

    // 3. Run the Agent 4.1 workflow (test case 2)
    await workflowAgent4_TC2(page, { agentName: env.agents[3], agentIndex: 3 });
  });
});