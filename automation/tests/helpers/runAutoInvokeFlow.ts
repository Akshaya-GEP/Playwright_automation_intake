import type { Page } from '@playwright/test';
import { login } from '../../pages/loginhelper';
import { QubeMeshPage } from '../../pages/qubeMeshPage';
import { getEnv } from '../../utils/env';
import { runAgentWorkflow } from '../../workflows/agentWorkflows';

export async function runAutoInvokeFlow(page: Page, agentIndex: 0 | 1 | 2 | 3 | 4) {
  const env = getEnv();
  const agentName = env.agents[agentIndex];

  await login(page);

  const qubeMesh = new QubeMeshPage(page);
  await qubeMesh.goto(env.qubeMeshUrl);
  // Temporary behavior change: do NOT start Auto Invoke or select a specific agent.
  // Workflows will type directly into "Ask me anything" without agent selection.

  // Agent-specific steps go here (you'll provide the details next).
  await runAgentWorkflow(page, { agentName, agentIndex });

  // TODO: If Qube Mesh needs a final "Submit/Run/Send" click, add it here.
  // await page.getByRole('button', { name: /submit|run|send/i }).click();
}


