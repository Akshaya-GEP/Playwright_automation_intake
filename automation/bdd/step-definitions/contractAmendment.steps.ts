import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { getContractAmendmentRow } from '../../test-data/contractAmendmentData';
import { workflowAgent2 } from '../../workflows/agent2';
import { workflowAgent2_1 } from '../../workflows/agent2.1';
import type { CustomWorld } from '../support/hooks';

const contractAmendmentWorkflows = new Map<
    string,
    typeof workflowAgent2 | typeof workflowAgent2_1
>([
    ['2', workflowAgent2],
    ['2.1', workflowAgent2_1],
]);

Given('contract amendment test data exists for {string}', async function (this: CustomWorld, sno: string) {
    this.contractAmendmentData = getContractAmendmentRow(sno);
});

When('I run contract amendment workflow for {string}', async function (this: CustomWorld, sno: string) {
    assert(this.page, 'World.page was not initialized (hook failure)');
    assert(this.env, 'World.env was not initialized (hook failure)');
    assert(this.contractAmendmentData, 'Contract amendment data was not loaded (missing Given step)');

    assert(this.agentName, 'Agent was not selected (missing "I open Qube Mesh..." step)');
    assert(this.agentIndex !== undefined, 'Agent index was not selected (missing "I open Qube Mesh..." step)');

    const ctx = { agentName: this.agentName, agentIndex: this.agentIndex };
    const data = this.contractAmendmentData;

    const normalizedSno = String(sno).trim();
    const workflow = contractAmendmentWorkflows.get(normalizedSno);
    if (!workflow) {
        const supported = Array.from(contractAmendmentWorkflows.keys()).join(', ');
        throw new Error(`Unsupported SNO "${normalizedSno}" for contract amendment BDD. Expected one of: ${supported}`);
    }

    this.workflowEnd = await workflow(this.page, ctx, data);
});
