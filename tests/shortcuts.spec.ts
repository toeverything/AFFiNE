import { test, expect } from '@playwright/test';
import { loadPage } from './libs/load-page.js';

loadPage();

test.describe('Shortcuts Modal', () => {
  test('Open shortcuts modal', async ({ page }) => {
    const faqIcon = page.locator('[data-testid=faq-icon]');
    const box = await faqIcon.boundingBox();
    expect(box?.x).not.toBeUndefined();
    await page.mouse.move((box?.x ?? 0) + 5, (box?.y ?? 0) + 5);

    const shortcutsIcon = page.locator('[data-testid=shortcuts-icon]');
    expect(await shortcutsIcon.isVisible()).toEqual(true);

    await shortcutsIcon.click();
    await page.waitForTimeout(800);
    const shortcutsModal = page.locator('[data-testid=shortcuts-modal]');
    await expect(shortcutsModal).toContainText('Keyboard Shortcuts');
  });
});
