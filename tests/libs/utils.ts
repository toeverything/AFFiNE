import type { Page } from '@playwright/test';

import userA from '../fixtures/userA.json';
import userB from '../fixtures/userB.json';

export async function createFakeUser(page: Page) {
  return page.evaluate(async () => {
    const response = await Promise.all([
      // Register user A
      fetch('http://localhost:3000/api/user/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'DebugCreateUser',
          ...userA,
        }),
      }),
      // Register user B
      fetch('http://localhost:3000/api/user/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'DebugCreateUser',
          ...userB,
        }),
      }),
    ]);
    return Promise.all(response.map(res => res.json()));
  });
}

export async function loginUser(
  page: Page,
  token: {
    refresh: string;
    token: string;
  }
) {
  await page.evaluate(async token => {
    // @ts-ignore
    globalThis.AFFINE_APIS.auth.setLogin(token);
  }, token);
}

export async function openHomePage(page: Page) {
  return page.goto('http://localhost:8080');
}
