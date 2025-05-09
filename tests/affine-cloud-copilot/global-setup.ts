import fs from 'node:fs';

import { skipOnboarding } from '@affine-test/kit/playwright';
import {
  createRandomAIUser,
  enableCloudWorkspace,
  loginUserDirectly,
} from '@affine-test/kit/utils/cloud';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import type { Page } from '@playwright/test';
import { chromium } from '@playwright/test';

function getUser() {
  return createRandomAIUser();
}

async function setupTestEnvironment(page: Page) {
  await openHomePage(page);
  await enableCloudWorkspace(page);
}

export default async function globalSetup() {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  await skipOnboarding(context);
  const page = await context.newPage();
  await page.goto('http://localhost:8080/', { timeout: 240 * 1000 });
  const user = await getUser();
  await page.getByTestId('sidebar-user-avatar').click({
    delay: 200,
    timeout: 20 * 1000,
  });
  await loginUserDirectly(page, user);
  await setupTestEnvironment(page);
  const state = await page.context().storageState();
  fs.writeFileSync('storageState.json', JSON.stringify(state));
  await browser.close();
}
