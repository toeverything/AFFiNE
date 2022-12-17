import { test, expect } from '@playwright/test';
import { loadPage } from './libs/load-page';

loadPage();

test.describe('Shortcuts Modal', () => {
  test('Open shortcuts modal', async ({ page }) => {
    const faqIcon = page.locator('[data-testid=faq-icon]');
    const box = await faqIcon.boundingBox();
    await expect(box?.x).not.toBeUndefined();
    await page.mouse.move((box?.x ?? 0) + 5, (box?.y ?? 0) + 5);

    const shortcutsIcon = page.locator('[data-testid=shortcuts-icon]');
    await expect(await shortcutsIcon.isVisible()).toEqual(true);

    await shortcutsIcon.click();

    const shortcutsModal = page.locator('[data-testid=shortcuts-modal]');
    await expect(shortcutsModal).toContainText('Keyboard Shortcuts');
  });
});
