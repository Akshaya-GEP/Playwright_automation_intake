import { expect, type Locator, type Page } from '@playwright/test';

export class LoginPage {
  readonly page: Page;
  readonly userIdInput: Locator;
  readonly passwordInput: Locator;
  readonly submitButton: Locator;
  readonly loginWithPasswordButton: Locator;

  constructor(page: Page) {
    this.page = page;

    // NOTE: Update these locators to match your login UI if needed.
    this.userIdInput = page
      .getByRole('textbox', { name: /username|user id|email/i })
      .or(page.getByLabel(/username|user id|email/i))
      .or(page.getByPlaceholder(/username|user id|email/i));

    // On this login page, the password field appears only after choosing "Login with Password".
    this.loginWithPasswordButton = page.getByRole('button', { name: /login with password/i });

    this.passwordInput = page
      .getByLabel(/password/i)
      .or(page.getByPlaceholder(/password/i))
      .or(page.locator('input[type="password"]'));

    // The final submit button name varies; try common labels, with fallbacks in `login()`.
    this.submitButton = page
      .getByRole('button', { name: /^login$/i })
      .or(page.getByRole('button', { name: /sign in|log in|submit|continue/i }));
  }

  async goto() {
    await this.page.goto('/');
  }

  async login(userId: string, password: string) {
    await this.closeFaqIfPresent();

    await this.userIdInput.fill(userId);

    // Ensure password auth mode is selected so password field exists.
    if (await this.loginWithPasswordButton.count()) {
      await this.loginWithPasswordButton.first().click().catch(() => {});
    }

    await expect(this.passwordInput).toBeVisible({ timeout: 10_000 });
    await this.passwordInput.fill(password);

    // Prefer a dedicated "Login" button if present; otherwise click "Login with Password" again as a fallback.
    const loginButton = this.page.getByRole('button', { name: /^login$/i });
    if (await loginButton.count()) {
      await loginButton.first().click();
    } else if (await this.submitButton.count()) {
      await this.submitButton.first().click();
    } else if (await this.loginWithPasswordButton.count()) {
      await this.loginWithPasswordButton.click();
    }

    // After login, don't wait for `networkidle` (SPAs often keep the network busy via polling/websockets).
    // Instead, wait for *any* reliable "logged in" signal.
    //
    // Render/PaaS environments can be slower (cold start, heavier latency), so allow more time there.
    const postLoginTimeoutMs =
      Number(process.env.LOGIN_TIMEOUT_MS) ||
      (process.env.RENDER || process.env.CI ? 120_000 : 30_000);

    await this.waitForLoggedInSignal(postLoginTimeoutMs);
  }

  async assertLoggedIn() {
    // Generic sanity: not on a login page anymore.
    await expect(this.page).not.toHaveURL(/login|signin/i);
  }

  private async closeFaqIfPresent() {
    // The login page sometimes opens an FAQ dialog that can block clicks/typing.
    const closeFaq = this.page
      .getByRole('button', { name: /close faq|close|✕/i })
      .or(this.page.getByRole('button', { name: /^x$/i }));

    if (await closeFaq.count()) {
      await closeFaq.first().click().catch(() => {});
    }
  }

  private async waitForLoggedInSignal(timeoutMs: number): Promise<void> {
    const logoutLike = this.page
      .getByRole('button', { name: /logout|log out|sign out/i })
      .or(this.page.getByRole('link', { name: /logout|log out|sign out/i }));

    // Some deployments land on an app shell immediately after login (no explicit logout link visible yet),
    // but they do render the main prompt textbox quickly.
    const appPrompt = this.page
      .getByRole('textbox', { name: /^prompt$/i })
      .or(this.page.getByRole('textbox', { name: /ask me anything|prompt/i }));

    try {
      await Promise.any([
        // Most reliable if the app navigates away from a login/signin URL.
        this.page.waitForURL((url) => !/login|signin/i.test(url.toString()), { timeout: timeoutMs }),
        // Or the login form disappears.
        this.userIdInput.waitFor({ state: 'hidden', timeout: timeoutMs }),
        this.passwordInput.waitFor({ state: 'hidden', timeout: timeoutMs }),
        // Or a logout/signout affordance appears.
        logoutLike.waitFor({ state: 'visible', timeout: timeoutMs }),
        // Or the main app prompt becomes visible.
        appPrompt.first().waitFor({ state: 'visible', timeout: timeoutMs }),
      ]);
      return;
    } catch (e) {
      const url = this.page.url();
      const title = await this.page.title().catch(() => '');

      // Detect common blockers (MFA / captcha / SSO redirects) to make CI failures actionable.
      const mfaLike = this.page.getByText(/verification code|one[-\s]?time pass(code)?|otp|two[-\s]?factor|mfa|authenticator/i);
      const captchaLike = this.page.getByText(/captcha|i am not a robot|recaptcha/i);
      const mfaVisible = await mfaLike.first().isVisible().catch(() => false);
      const captchaVisible = await captchaLike.first().isVisible().catch(() => false);

      const bodySnippet = await this.page
        .locator('body')
        .innerText()
        .then((t) => (t || '').replace(/\s+/g, ' ').slice(0, 500))
        .catch(() => '');

      console.log(
        `[LoginPage] post-login wait failed after ${timeoutMs}ms. url=${url} title=${JSON.stringify(title)} mfaVisible=${mfaVisible} captchaVisible=${captchaVisible} bodySnippet=${JSON.stringify(bodySnippet)}`
      );

      const hint =
        mfaVisible
          ? 'Login appears blocked by MFA/OTP. Use a non-MFA test account or a pre-authenticated storageState.'
          : captchaVisible
            ? 'Login appears blocked by a CAPTCHA. Use a test account without CAPTCHA or disable CAPTCHA in test env.'
            : 'Login did not reach a known "logged in" state in time. Check BASE_URL and whether the login flow changed.';

      throw new Error(`Login did not complete within ${timeoutMs}ms. ${hint}`, { cause: e as any });
    }
  }
}


