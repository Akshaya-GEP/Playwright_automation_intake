import { test } from '../fixtures/testFixtures';
import { workflowAgent4_1 } from '../workflows/agent4_1';
import { getContractExtensionRow } from '../test-data/contractExtensionData';

test.describe('Agent 4.1 - Contract Extension Variation', () => {
    test('runs contract extension 4.1 workflow', async ({ page, qubeMeshPage }) => {
        test.setTimeout(900_000);
        // Auto Invoke / agent selection removed: start by typing into "Ask me anything".
        void qubeMeshPage;

        const data = getContractExtensionRow('4.1');
        const ctx = {
            agentIndex: 3,
            agentName: 'Agent 4',
            isParallel: false
        };
        await workflowAgent4_1(page, ctx, data);
    });
});
