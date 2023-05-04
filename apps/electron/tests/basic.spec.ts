import { resolve } from 'node:path';

import { test, testResultDir } from '@affine-test/kit/playwright';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';
import type { ElectronApplication } from 'playwright';
import { _electron as electron } from 'playwright';

let electronApp: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  electronApp = await electron.launch({
    args: [resolve(__dirname, '..')],
    executablePath: resolve(__dirname, '../node_modules/.bin/electron'),
    colorScheme: 'light',
  });
  page = await electronApp.firstWindow();
  await page.getByTestId('onboarding-modal-close-button').click({
    delay: 100,
  });
  // cleanup page data
  await page.evaluate(() => localStorage.clear());
});

test.afterEach(async () => {
  // cleanup page data
  await page.evaluate(() => localStorage.clear());
  await page.close();
  await electronApp.close();
});

test('new page', async () => {
  await page.getByTestId('new-page-button').click({
    delay: 100,
  });
  await page.waitForSelector('v-line');
  const flavour = await page.evaluate(
    // @ts-expect-error
    () => globalThis.currentWorkspace.flavour
  );
  expect(flavour).toBe('local');
});

test('app theme', async () => {
  await page.waitForSelector('v-line');
  const root = page.locator('html');
  {
    const themeMode = await root.evaluate(element =>
      element.getAttribute('data-theme')
    );
    expect(themeMode).toBe('light');
  }
  await page.screenshot({
    path: resolve(testResultDir, 'affine-light-theme-electron.png'),
  });
  await page.getByTestId('editor-option-menu').click();
  await page.getByTestId('change-theme-dark').click();
  await page.waitForTimeout(50);
  {
    const themeMode = await root.evaluate(element =>
      element.getAttribute('data-theme')
    );
    expect(themeMode).toBe('dark');
  }
  await page.screenshot({
    path: resolve(testResultDir, 'affine-dark-theme-electron.png'),
  });
});

test('affine cloud disabled', async () => {
  await page.getByTestId('new-page-button').click({
    delay: 100,
  });
  await page.waitForSelector('v-line');
  await page.getByTestId('current-workspace').click();
  await page.getByTestId('sign-in-button').click();
  await page.getByTestId('disable-affine-cloud-modal').waitFor({
    state: 'visible',
  });
});
test('affine onboarding button', async () => {
  await page.getByTestId('help-island').click();
  await page.getByTestId('easy-guide').click();
  const onboardingModal = page.locator('[data-testid=onboarding-modal]');
  expect(await onboardingModal.isVisible()).toEqual(true);
  const switchVideo = page.locator(
    '[data-testid=onboarding-modal-switch-video]'
  );
  expect(await switchVideo.isVisible()).toEqual(true);
  await page.getByTestId('onboarding-modal-next-button').click();
  const editingVideo = page.locator(
    '[data-testid=onboarding-modal-editing-video]'
  );
  expect(await editingVideo.isVisible()).toEqual(true);
  await page.getByTestId('onboarding-modal-ok-button').click();

  expect(await onboardingModal.isVisible()).toEqual(false);
});
