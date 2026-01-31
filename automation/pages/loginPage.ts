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
      await this.loginWithPasswordButton.click();
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
    // Reduced timeout for faster authentication completion
    const postLoginTimeoutMs = 15_000;

    const logoutLike = this.page
      .getByRole('button', { name: /logout|log out|sign out/i })
      .or(this.page.getByRole('link', { name: /logout|log out|sign out/i }));

    await Promise.any([
      // Most reliable if the app navigates away from a login/signin URL.
      this.page.waitForURL((url) => !/login|signin/i.test(url.toString()), { timeout: postLoginTimeoutMs }),
      // Or the login form disappears.
      this.userIdInput.waitFor({ state: 'hidden', timeout: postLoginTimeoutMs }),
      this.passwordInput.waitFor({ state: 'hidden', timeout: postLoginTimeoutMs }),
      // Or a logout/signout affordance appears.
      logoutLike.waitFor({ state: 'visible', timeout: postLoginTimeoutMs })
    ]);
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
}


