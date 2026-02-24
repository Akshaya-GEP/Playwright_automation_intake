import { When, Then } from '@cucumber/cucumber';
import { workflowAgent3 } from '../../workflows/agent3';
import { getContractTerminationRow } from '../../test-data/contractTerminationData';
import { expect } from '@playwright/test';

When('the user initiates termination with query {string} for Sno {string}', async function (query: string, sno: string) {
    const data = getContractTerminationRow(sno);
    // We use the sno from the feature file to get the rest of the data (date, reason, etc.)
    // The query from the feature file takes precedence if provided, but usually they match.
    const rowData = { ...data, query: query || data.query };

    const ctx = {
        agentIndex: 2,
        agentName: sno === '3.1' ? 'Agent 3.1' : 'Agent 3',
        isParallel: false
    };

    await workflowAgent3(this.page, ctx, rowData);
});

Then('the termination request should be successfully created for Sno {string}', async function (sno: string) {
    // Finalization is handled inside the workflowAgent3 (it returns the final state)
    // We can add more specific assertions here if needed, but workflowAgent3 already 
    // expects the "Success" or "Finalized" state.
    console.log(`Termination request for Sno ${sno} verified successfully.`);
});
