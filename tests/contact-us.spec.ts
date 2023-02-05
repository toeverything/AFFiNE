import { expect } from '@playwright/test';
import { test } from './libs/playwright.js';
import { loadPage } from './libs/load-page.js';

loadPage();

test.describe('Open contact us', () => {
  test.skip('Click about us', async ({ page }) => {
    const currentWorkspace = page.getByTestId('current-workspace');
    await currentWorkspace.click();
    // await page.waitForTimeout(1000);
    await page
      .getByRole('tooltip', {
        name: 'AFFiNE Log in to sync with affine About AFFiNE',
      })
      .locator('div')
      .filter({ hasText: 'About AFFiNE' })
      .nth(2)
      .click();
    const contactUsModal = page.locator(
      '[data-testid=contact-us-modal-content]'
    );
    await expect(contactUsModal).toContainText('AFFiNE Community');
  });
  test('Click right-bottom corner contact icon', async ({ page }) => {
    const faqIcon = page.locator('[data-testid=faq-icon]');
    const box = await faqIcon.boundingBox();
    expect(box?.x).not.toBeUndefined();

    await page.mouse.move((box?.x ?? 0) + 10, (box?.y ?? 0) + 10);
    await page.mouse.move((box?.x ?? 0) + 5, (box?.y ?? 0) + 5);
    const rightBottomContactUs = page.locator(
      '[data-testid=right-bottom-contact-us-icon]'
    );
    expect(await rightBottomContactUs.isVisible()).toEqual(true);

    await rightBottomContactUs.click();
    const contactUsModal = page.locator(
      '[data-testid=contact-us-modal-content]'
    );
    await expect(contactUsModal).toContainText('AFFiNE Community');
  });
});
