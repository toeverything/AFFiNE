import { test, expect, type Page } from '@playwright/test';
import { loadPage } from './libs/load-page';

loadPage();

test.describe('Open contact us', () => {
  test('Click right-bottom corner contact icon', async ({ page }) => {
    page.waitForTimeout(1000);
    const faqIcon = page.locator('[data-testid=faq-icon]');
    const box = await faqIcon.boundingBox();
    await expect(box?.x).not.toBeUndefined();
    await page.mouse.move((box?.x ?? 0) + 5, (box?.y ?? 0) + 5);

    const rightBottomContactUs = page.locator(
      '[data-testid=right-bottom-contact-us-icon]'
    );
    await expect(await rightBottomContactUs.isVisible()).toEqual(true);

    await rightBottomContactUs.click();

    const contactUsModal = page.locator(
      '[data-testid=contact-us-modal-content]'
    );
    await expect(contactUsModal).toContainText('AFFiNE Community');
  });
});
