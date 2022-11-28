import { test, expect, type Page } from '@playwright/test';
import { loadPage } from './libs/load-page';

loadPage();

test.describe('Open contact us', () => {
  test('Click left-top corner Logo', async ({ page }) => {
    const leftTopCorner = page.locator('[data-testid=left-top-corner-logo]');
    await leftTopCorner.click();

    const contactUsModal = page.locator(
      '[data-testid=contact-us-modal-content]'
    );
    await expect(contactUsModal).toContainText('Join our community.');
  });

  test('Click right-bottom corner contact icon', async ({ page }) => {
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
    await expect(contactUsModal).toContainText('Join our community.');
  });
});
