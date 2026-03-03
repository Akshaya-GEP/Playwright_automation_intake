import { Given, Then, When } from '@cucumber/cucumber';
import assert from 'node:assert/strict';

import { QubeMeshPage } from '../../pages/qubeMeshPage';
import { getSupplierOffboardingRow } from '../../test-data/supplierOffboardingData';
import { workflowAgent1 } from '../../workflows/agent1';
import { workflowAgent1_2 } from '../../workflows/agent1.2';
import type { CustomWorld } from '../support/hooks';

// Keep a single callable type to avoid TS issues with unions of function types.
// `workflowAgent1_2` is compatible with `workflowAgent1`'s signature.
const supplierOffboardingWorkflows = new Map<string, typeof workflowAgent1>([
  ['1', workflowAgent1],
  ['1.2', workflowAgent1_2],
]);

Given('supplier offboarding test data exists for {string}', async function (this: CustomWorld, sno: string) {
  this.supplierOffboardingData = getSupplierOffboardingRow(sno);
});

Given(
  'I open Qube Mesh and start Auto Invoke for agent index {int}',
  async function (this: CustomWorld, agentIndex: number) {
    assert(this.page, 'World.page was not initialized (hook failure)');
    assert(this.env, 'World.env was not initialized (hook failure)');

    const idx = agentIndex as 0 | 1 | 2 | 3 | 4;
    const agentName = this.env.agents[idx];

    const qubeMeshPage = new QubeMeshPage(this.page);
    await qubeMeshPage.goto(this.env.qubeMeshUrl);
    // Temporary behavior change: do NOT start Auto Invoke or select a specific agent.
    // Workflows will type directly into "Ask me anything" without agent selection.

    // Persist on World so later steps can use the same agent context (no hard-coding).
    this.agentIndex = idx;
    this.agentName = agentName;
  },
);

When('I run supplier offboarding workflow for {string}', async function (this: CustomWorld, sno: string) {
  assert(this.page, 'World.page was not initialized (hook failure)');
  assert(this.env, 'World.env was not initialized (hook failure)');
  assert(this.supplierOffboardingData, 'Supplier offboarding data was not loaded (missing Given step)');

  assert(this.agentName, 'Agent was not selected (missing "I open Qube Mesh..." step)');
  assert(this.agentIndex !== undefined, 'Agent index was not selected (missing "I open Qube Mesh..." step)');

  const ctx = { agentName: this.agentName, agentIndex: this.agentIndex };
  const data = this.supplierOffboardingData;

  const normalizedSno = String(sno).trim();
  const workflow = supplierOffboardingWorkflows.get(normalizedSno);
  if (!workflow) {
    const supported = Array.from(supplierOffboardingWorkflows.keys()).join(', ');
    throw new Error(`Unsupported SNO "${normalizedSno}" for supplier offboarding BDD. Expected one of: ${supported}`);
  }

  this.workflowEnd = await workflow(this.page, ctx, data);
});

Then('the workflow should reach the end screen', async function (this: CustomWorld) {
  assert(this.workflowEnd, 'Workflow did not produce an end-state (it may have failed before finalization)');
  assert(
    ['congratulations', 'send-for-validation', 'edit-project-request-only'].includes(this.workflowEnd.endedBy),
    `Unexpected endedBy value: ${this.workflowEnd.endedBy}`,
  );
});