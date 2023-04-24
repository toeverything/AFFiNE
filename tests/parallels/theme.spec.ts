import { resolve } from 'node:path';

import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { waitMarkdownImported } from '../libs/page-logic';
import { test } from '../libs/playwright';
import { testResultDir } from '../libs/utils';

// default could be anything according to the system
test('default white', async ({ browser }) => {
  const context = await browser.newContext({
    colorScheme: 'light',
  });
  const page = await context.newPage();
  await openHomePage(page);
  await waitMarkdownImported(page);
  const root = page.locator('html');
  const themeMode = await root.evaluate(element =>
    element.getAttribute('data-theme')
  );
  expect(themeMode).toBe('light');
  const prev = await page.screenshot({
    path: resolve(testResultDir, 'affine-light-theme.png'),
  });
  await page.getByTestId('change-theme-dark').click();
  await page.waitForTimeout(50);
  const after = await page.screenshot({
    path: resolve(testResultDir, 'affine-dark-theme.png'),
  });
  expect(prev).not.toEqual(after);
});

// test('change theme to dark', async ({ page }) => {
//   const changeThemeContainer = page.locator(
//     '[data-testid=change-theme-container]'
//   );
//   const box = await changeThemeContainer.boundingBox();
//   expect(box?.x).not.toBeUndefined();
//
//   await page.mouse.move((box?.x ?? 0) + 5, (box?.y ?? 0) + 5);
//   await page.waitForTimeout(1000);
//   const darkButton = page.locator('[data-testid=change-theme-dark]');
//   const darkButtonPositionTop = await darkButton.evaluate(
//     element => element.getBoundingClientRect().y
//   );
//   expect(darkButtonPositionTop).toBe(box?.y);
//
//   await page.mouse.click((box?.x ?? 0) + 5, (box?.y ?? 0) + 5);
//   const root = page.locator('html');
//   const themeMode = await root.evaluate(element =>
//     element.getAttribute('data-theme')
//   );
//   expect(themeMode).toBe('dark');
// });
