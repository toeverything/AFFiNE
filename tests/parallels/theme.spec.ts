import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { waitMarkdownImported } from '../libs/page-logic';
import { test } from '../libs/playwright';

test.describe('Change Theme', () => {
  // default could be anything according to the system
  test('default white', async ({ browser }) => {
    const context = await browser.newContext({
      colorScheme: 'light',
    });
    const page = await context.newPage();
    await openHomePage(page);
    await waitMarkdownImported(page);
    await page.waitForSelector('html');
    const root = page.locator('html');
    const themeMode = await root.evaluate(element =>
      element.getAttribute('data-theme')
    );
    expect(themeMode).toBe('light');

    await page.waitForTimeout(50);
    const rightMenu = page.getByTestId('editor-option-menu');
    const rightMenuBox = await rightMenu.boundingBox();
    const lightButton = page.getByTestId('change-theme-light');
    const lightButtonBox = await lightButton.boundingBox();
    const darkButton = page.getByTestId('change-theme-dark');
    const darkButtonBox = await darkButton.boundingBox();
    if (!rightMenuBox || !lightButtonBox || !darkButtonBox) {
      throw new Error('rightMenuBox or lightButtonBox or darkButtonBox is nil');
    }
    expect(darkButtonBox.x).toBeLessThan(rightMenuBox.x);
    expect(darkButtonBox.y).toBeGreaterThan(rightMenuBox.y);
    expect(lightButtonBox.y).toBeCloseTo(rightMenuBox.y);
    expect(lightButtonBox.x).toBeCloseTo(darkButtonBox.x);
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
});
