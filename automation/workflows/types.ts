import type { Page } from '@playwright/test';

export type AgentContext = {
  agentName: string;
  agentIndex: number; // 0..4 (based on AGENTS order)
};

export type AgentWorkflow = (page: Page, ctx: AgentContext) => Promise<void>;


