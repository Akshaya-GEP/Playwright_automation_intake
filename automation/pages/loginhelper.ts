import type { Page } from '@playwright/test';
import { LoginPage } from './loginPage';
import { getEnv } from '../utils/env';

export async function login(page: Page) {
  const env = getEnv();
  const loginPage = new LoginPage(page);
  await loginPage.goto();
  await loginPage.login(env.userId, env.password);
  await loginPage.assertLoggedIn();
}


