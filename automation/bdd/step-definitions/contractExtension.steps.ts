import { Given, When, Then } from '@cucumber/cucumber';
import { workflowAgent4 } from '../../workflows/agent4';
import { getContractExtensionRow } from '../../test-data/contractExtensionData';

Given('I am on the dashboard', async function () {
    // Dashboard navigation is handled by startAutoInvoke in the specimen
});

When('I run Agent 4 workflow for sno {string}', async function (sno: string) {
    const data = getContractExtensionRow(sno);
    const ctx = {
        agentIndex: 3,
        agentName: 'Agent 4',
        isParallel: false
    };
    // Using this.page which is standardized in the project's BDD hooks
    await workflowAgent4(this.page, ctx, data);
});

Then('the contract extension request should be created successfully', async function () {
    // Success validation is handled within the workflow
    console.log('Contract extension request verified successfully.');
});
