import { test } from '../fixtures/testFixtures';
import { workflowAgent5 } from '../workflows/agent5';
import { getSupplierProfileUpdateRow } from '../test-data/supplierProfileUpdateData';

test.describe('Agent 5 - Supplier Profile Update', () => {
    test('runs agent 5 workflow', async ({ page, qubeMeshPage }) => {
        test.setTimeout(900_000);
        // Auto Invoke / agent selection removed: start by typing into "Ask me anything".
        void qubeMeshPage;

        const data = getSupplierProfileUpdateRow('5');
        const ctx = {
            agentIndex: 4,
            agentName: 'Agent 5',
            isParallel: false,
        };
        await workflowAgent5(page, ctx);
    });
});


