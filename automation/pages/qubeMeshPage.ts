import type { Locator, Page } from '@playwright/test';

export class QubeMeshPage {
  readonly page: Page;
  readonly agentSearchInput: Locator;
  readonly userQueryInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.agentSearchInput = page
      .locator('#agent-search')
      .or(page.getByRole('textbox', { name: /agent search/i }))
      .or(page.getByPlaceholder(/search agent/i));
    this.userQueryInput = page
      .getByLabel(/ask me anything|user query|query|prompt/i)
      .or(page.getByPlaceholder(/ask me anything|user query|query|prompt/i));
  }

  async goto(qubeMeshUrl: string) {
    const timeoutMs = 120_000;
    const resolvedUrl = this.ensureQubeMeshRoute(qubeMeshUrl);
    const target = new URL(resolvedUrl);

    await this.page.goto(resolvedUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });

    // Handle redirects and query/hash differences by matching host + path prefix.
    await this.page.waitForURL(
      (url) =>
        url.host === target.host &&
        url.pathname.startsWith(target.pathname) &&
        (target.hash ? url.hash.startsWith(target.hash) : true),
      // SPAs often keep the page in a state where the `load` event never fires reliably.
      // Match the navigation but only wait for DOMContentLoaded.
      { timeout: timeoutMs, waitUntil: 'domcontentloaded' }
    );

    // Give the app a moment to render the Qube Mesh UI.
    await this.page.waitForLoadState('domcontentloaded');

    // Primary entrypoint: the query textbox should be available without selecting an agent.
    // (We intentionally don't wait for `networkidle`; Qube Mesh may keep connections open.)
    await this.userQueryInput.first().waitFor({ state: 'visible', timeout: timeoutMs });
  }

  async startAutoInvoke() {
    const timeoutMs = 120_000;

    // Prefer main frame locator first.
    const main = this.getAutoInvokeButton();
    if ((await main.count()) > 0) {
      await main.first().waitFor({ state: 'visible', timeout: timeoutMs });
      await main.first().click({ timeout: timeoutMs });
      return;
    }

    // Fallback: sometimes the app is embedded; look for the button inside iframes.
    for (const frame of this.page.frames()) {
      const inFrame = frame.getByRole('button', { name: /auto invoke/i });
      if ((await inFrame.count()) > 0) {
        await inFrame.first().waitFor({ state: 'visible', timeout: timeoutMs });
        await inFrame.first().click({ timeout: timeoutMs });
        return;
      }
    }

    // Final attempt: wait for it to appear anywhere on the page, then click.
    await this.getAutoInvokeButton().first().waitFor({ state: 'visible', timeout: timeoutMs });
    await this.getAutoInvokeButton().first().click({ timeout: timeoutMs });
  }

  async setAgentName(agentName: string) {
    // Assumes the Auto Invoke agent picker is already open (after startAutoInvoke()).
    // The picker provides a search box; use it to filter and then click the agent entry.
    await this.agentSearchInput.waitFor({ state: 'visible', timeout: 30_000 });
    const query = agentName.replace(/[_-]+/g, ' ').trim();
    await this.agentSearchInput.fill(query);

    // Agent entries are rendered as role=button items with aria-label = agent name.
    // Prefer exact match but keep a contains fallback.
    const exact = this.page.getByRole('button', { name: agentName, exact: true });
    // Fuzzy match: treat underscores/spaces/dashes the same and match by tokens in order.
    const tokens = query
      .toLowerCase()
      .split(/[^a-z0-9]+/g)
      .filter(Boolean);
    const tokenPattern = tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    const contains = this.page.getByRole('button', { name: new RegExp(tokenPattern || query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') });

    if ((await exact.count()) > 0) {
      await exact.first().click();
      return;
    }

    await contains.first().scrollIntoViewIfNeeded();
    await contains.first().click({ timeout: 30_000 });
  }

  async setUserQuery(userQuery: string) {
    await this.userQueryInput.fill(userQuery);
  }

  private getAutoInvokeButton(): Locator {
    // In the current UI, "Auto Invoke" can appear as:
    // - a real button named "Auto Invoke"
    // - text inside a button whose accessible name is "Select Agent"
    const direct = this.page.getByRole('button', { name: /auto invoke/i });

    const selectAgent = this.page
      .getByRole('button', { name: /select agent/i })
      .filter({ hasText: /auto invoke/i });

    // Extra fallback: any button that visually contains "Auto Invoke"
    const anyButtonWithText = this.page.getByRole('button').filter({ hasText: /auto invoke/i });

    return direct.or(selectAgent).or(anyButtonWithText);
  }

  private ensureQubeMeshRoute(qubeMeshUrl: string): string {
    // Qube Mesh is hash-routed in some environments. If the caller provides a base shell URL,
    // append "#/qube-mesh" so we land on the correct screen.
    const u = new URL(qubeMeshUrl);
    const normalizedHash = (u.hash || '').toLowerCase();
    if (!normalizedHash || normalizedHash === '#') {
      u.hash = '#/qube-mesh';
    } else if (!normalizedHash.includes('qube-mesh')) {
      // Preserve any existing hash route by appending a path segment.
      u.hash = u.hash.replace(/#\/?/, '#/') + '/qube-mesh';
    }
    return u.toString();
  }
}


