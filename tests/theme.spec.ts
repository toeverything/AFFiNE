import { expect } from '@playwright/test';

import { loadPage } from './libs/load-page';
import { test } from './libs/playwright';

loadPage();

test.describe('Change Theme', () => {
  test('default white', async ({ page }) => {
    await page.waitForSelector('html');
    const root = page.locator('html');
    const themeMode = await root.evaluate(element =>
      window.getComputedStyle(element).getPropertyValue('--affine-theme-mode')
    );
    expect(themeMode).toBe('light');

    const lightButton = page.locator('[data-testid=change-theme-light]');
    const buttonPositionTop = await lightButton.evaluate(
      element => window.getComputedStyle(element).top
    );
    expect(buttonPositionTop).toBe('0px');
  });

  test('change theme to dark', async ({ page }) => {
    const changeThemeContainer = page.locator(
      '[data-testid=change-theme-container]'
    );
    const box = await changeThemeContainer.boundingBox();
    expect(box?.x).not.toBeUndefined();

    await page.mouse.move((box?.x ?? 0) + 5, (box?.y ?? 0) + 5);
    await page.waitForTimeout(1000);
    const darkButton = page.locator('[data-testid=change-theme-dark]');
    const darkButtonPositionTop = await darkButton.evaluate(
      element => element.getBoundingClientRect().y
    );
    expect(darkButtonPositionTop).toBe(box?.y);

    await page.mouse.click((box?.x ?? 0) + 5, (box?.y ?? 0) + 5);
    const root = page.locator('html');
    const themeMode = await root.evaluate(element =>
      window.getComputedStyle(element).getPropertyValue('--affine-theme-mode')
    );
    expect(themeMode).toBe('dark');
  });
});
