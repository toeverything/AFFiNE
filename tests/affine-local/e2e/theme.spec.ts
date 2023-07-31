import { resolve } from 'node:path';

import { test, testResultDir } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

// default could be anything, according to the system
test('default white', async ({ browser }) => {
  const context = await browser.newContext({
    colorScheme: 'light',
  });
  const page = await context.newPage();
  await openHomePage(page);
  await waitEditorLoad(page);
  const root = page.locator('html');
  const themeMode = await root.evaluate(element =>
    element.getAttribute('data-theme')
  );
  expect(themeMode).toBe('light');
  await page.screenshot({
    path: resolve(testResultDir, 'affine-light-theme.png'),
  });
  await page.getByTestId('settings-modal-trigger').click();
  await page.getByTestId('appearance-panel-trigger').click();
  await page.waitForTimeout(50);
  await page.getByTestId('dark-theme-trigger').click();
  const darkMode = await root.evaluate(element =>
    element.getAttribute('data-theme')
  );
  expect(darkMode).toBe('dark');
  await page.screenshot({
    path: resolve(testResultDir, 'affine-dark-theme.png'),
  });
});
