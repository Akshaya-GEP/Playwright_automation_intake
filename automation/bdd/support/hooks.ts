import { After, AfterAll, Before, BeforeAll, setDefaultTimeout, setWorldConstructor } from '@cucumber/cucumber';
import { chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';
import fs from 'fs';
import { dirname } from 'path';
import { STORAGE_STATE, ensureStorageStateFileExists } from '../../config/storageState';
import { LoginPage } from '../../pages/loginPage';
import { getEnv, getMissingRequiredEnvVars, type EnvConfig } from '../../utils/env';
import type { SupplierOffboardingRow } from '../../test-data/supplierOffboardingData';
import type { ContractAmendmentRow } from '../../test-data/contractAmendmentData';

// Playwright flows are slow (SSO, heavy dashboards). Increase Cucumber's default 5s timeout.
setDefaultTimeout(300_000);

export type WorkflowEnd =
  | { endedBy: 'congratulations'; clickedSendForValidation: false }
  | { endedBy: 'send-for-validation'; clickedSendForValidation: true }
  | { endedBy: 'edit-project-request-only'; clickedSendForValidation: false };

export class CustomWorld {
  env: EnvConfig | undefined;
  context: BrowserContext | undefined;
  page: Page | undefined;
  /**
   * Optional agent context selected by BDD steps (e.g. "I open Qube Mesh ... agent index X").
   * Stored on the World so later steps don't have to re-derive or hardcode it.
   */
  agentIndex: (0 | 1 | 2 | 3 | 4) | undefined;
  agentName: string | undefined;
  supplierOffboardingData: SupplierOffboardingRow | undefined;
  contractAmendmentData: ContractAmendmentRow | undefined;
  workflowEnd: WorkflowEnd | undefined;

  constructor() { }
}

setWorldConstructor(CustomWorld);

let browser: Browser | undefined;
let envGlobal: EnvConfig | undefined;

function isTruthyEnv(name: string): boolean {
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(process.env[name] || '').trim().toLowerCase());
}

async function getOrLaunchBrowser(): Promise<Browser> {
  if (browser && browser.isConnected()) return browser;

  const headless = !isTruthyEnv('PW_HEADED') && !isTruthyEnv('HEADED');
  browser = await chromium.launch({ headless });
  browser.on('disconnected', () => {
    // Mark as unusable so the next scenario can auto-recover.
    browser = undefined;
  });
  return browser;
}

async function ensureAuthenticatedStorageState(env: EnvConfig, b: Browser) {
  const authDir = dirname(STORAGE_STATE);
  if (!fs.existsSync(authDir)) fs.mkdirSync(authDir, { recursive: true });

  const stateExists = fs.existsSync(STORAGE_STATE);
  if (stateExists) {
    try {
      const raw = fs.readFileSync(STORAGE_STATE, 'utf-8');
      const parsed = JSON.parse(raw) as { cookies?: unknown[]; origins?: unknown[] };
      const cookies = Array.isArray(parsed.cookies) ? parsed.cookies : [];
      const origins = Array.isArray(parsed.origins) ? parsed.origins : [];
      if (cookies.length || origins.length) return; // looks authenticated
    } catch {
      // fall through: re-auth
    }
  }

  // Re-auth and write storage state (mirrors automation/auth/auth.setup.ts behavior)
  const ctx = await b.newContext();
  const page = await ctx.newPage();
  const loginPage = new LoginPage(page);

  await page.goto(env.baseURL, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  await loginPage.login(env.userId, env.password);
  await loginPage.assertLoggedIn();
  await page.waitForLoadState('domcontentloaded', { timeout: 10_000 }).catch(() => { });

  await ctx.storageState({ path: STORAGE_STATE });
  await ctx.close();
}

BeforeAll(async () => {
  const missing = getMissingRequiredEnvVars();
  if (missing.length) {
    throw new Error(
      `Missing required env vars: ${missing.join(
        ', ',
      )}. These are still required for authentication (keep secrets in .env / env vars).`,
    );
  }

  envGlobal = getEnv();
  ensureStorageStateFileExists();
  const b = await getOrLaunchBrowser();
  await ensureAuthenticatedStorageState(envGlobal, b);
});

Before(async function (this: CustomWorld) {
  this.env = envGlobal!;
  const b = await getOrLaunchBrowser();
  this.context = await b.newContext({ storageState: STORAGE_STATE });
  this.page = await this.context.newPage();
});

After(async function (this: CustomWorld) {
  await this.context?.close().catch(() => { });
  this.context = undefined;
  this.page = undefined;
});

AfterAll(async () => {
  if (browser && browser.isConnected()) {
    await browser.close().catch(() => { });
  }
  browser = undefined;
});


