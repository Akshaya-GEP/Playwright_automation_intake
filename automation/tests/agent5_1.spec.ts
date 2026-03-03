import { test } from '../fixtures/testFixtures';
import { workflowAgent5_TC2 } from '../workflows/agent5_1';
import { getSupplierProfileUpdateRow } from '../test-data/supplierProfileUpdateData';

test.describe('Agent 5.1 - Supplier Profile Update (TC2)', () => {
    test('runs agent 5.1 workflow', async ({ page, qubeMeshPage }) => {
        test.setTimeout(900_000);
        // Auto Invoke / agent selection removed: start by typing into "Ask me anything".
        void qubeMeshPage;

        const data = getSupplierProfileUpdateRow('5.1');
        const ctx = {
            agentIndex: 4,
            agentName: 'Agent 5.1',
            isParallel: false,
        };
        await workflowAgent5_TC2(page, ctx, data);
    });
});


