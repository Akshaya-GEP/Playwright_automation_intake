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

    // NOTE: In some environments the "Ask me anything" control is NOT an <input>/<textarea>.
    // It can be a contenteditable element with role="textbox" and accessible name "Prompt".
    // `getByRole('textbox', { name: ... })` reliably catches that case.
    this.userQueryInput = page
      .getByRole('textbox', { name: /^prompt$/i })
      .or(page.getByRole('textbox', { name: /ask me anything|user query|query|prompt/i }))
      .or(page.getByPlaceholder(/ask me anything|user query|query|prompt/i))
      .or(page.getByLabel(/ask me anything|user query|query|prompt/i));
  }

  async goto(qubeMeshUrl: string) {
    const totalTimeoutMs = 120_000;

    // Different deployments may be hash-routed (/#/qube-mesh) or path-routed (/qube-mesh).
    // Try a few candidate URLs quickly instead of waiting 120s on the wrong route.
    const candidates = this.buildQubeMeshCandidateUrls(qubeMeshUrl);
    const perAttemptTimeoutMs = Math.max(20_000, Math.floor(totalTimeoutMs / Math.max(1, candidates.length)));

    let lastErr: unknown = undefined;
    for (const candidate of candidates) {
      const target = new URL(candidate);
      try {
        await this.page.goto(candidate, { waitUntil: 'domcontentloaded', timeout: perAttemptTimeoutMs });

        // Handle redirects and query/hash differences by matching host + path prefix.
        await this.page.waitForURL(
          (url) =>
            url.host === target.host &&
            url.pathname.startsWith(target.pathname) &&
            (target.hash ? url.hash.startsWith(target.hash) : true),
          // SPAs often keep the page in a state where the `load` event never fires reliably.
          // Match the navigation but only wait for DOMContentLoaded.
          { timeout: perAttemptTimeoutMs, waitUntil: 'domcontentloaded' }
        );

        // Give the app a moment to hydrate/attach handlers.
        await this.page.waitForLoadState('domcontentloaded');
        await this.page.waitForTimeout(1500);

        // Primary entrypoint: the query textbox should be available without selecting an agent.
        // (We intentionally don't wait for `networkidle`; Qube Mesh may keep connections open.)
        await this.userQueryInput.first().waitFor({ state: 'visible', timeout: perAttemptTimeoutMs });
        return;
      } catch (err) {
        lastErr = err;
        const url = this.page.url();
        const title = await this.page.title().catch(() => '');
        const bodySnippet = await this.page
          .locator('body')
          .innerText()
          .then((t) => (t || '').replace(/\s+/g, ' ').slice(0, 400))
          .catch(() => '');
        console.log(
          `[QubeMeshPage.goto] attempt failed. candidate=${candidate} currentUrl=${url} title=${JSON.stringify(title)} bodySnippet=${JSON.stringify(bodySnippet)}`
        );
      }
    }

    throw lastErr ?? new Error(`QubeMeshPage.goto: failed to navigate to Qube Mesh. Tried: ${candidates.join(', ')}`);
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

  private buildQubeMeshCandidateUrls(qubeMeshUrl: string): string[] {
    const original = new URL(qubeMeshUrl);
    const urls = new Set<string>();

    const add = (u: URL) => urls.add(u.toString());
    add(original);

    const pathHas = original.pathname.toLowerCase().includes('qube-mesh');
    const hash = (original.hash || '').toLowerCase();
    const hashHas = hash.includes('qube-mesh');

    // Candidate 1: force hash route.
    if (!hashHas) {
      const u = new URL(original.toString());
      if (!hash || hash === '#') {
        u.hash = '#/qube-mesh';
      } else {
        u.hash = u.hash.replace(/#\/?/, '#/') + '/qube-mesh';
      }
      add(u);
    }

    // Candidate 2: force path route.
    if (!pathHas) {
      const u = new URL(original.toString());
      u.hash = '';
      u.pathname = u.pathname.replace(/\/$/, '') + '/qube-mesh';
      add(u);
    }

    return Array.from(urls);
  }
}


