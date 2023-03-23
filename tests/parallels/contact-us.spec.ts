import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { test } from '../libs/playwright';

test.describe('Open contact us', () => {
  test('Click right-bottom corner contact icon', async ({ page }) => {
    await openHomePage(page);
    await page.locator('[data-testid=help-island]').click();
    const rightBottomContactUs = page.locator(
      '[data-testid=right-bottom-contact-us-icon]'
    );
    expect(await rightBottomContactUs.isVisible()).toEqual(true);

    await rightBottomContactUs.click();
    const contactUsModal = page.locator(
      '[data-testid=contact-us-modal-content]'
    );
    await expect(contactUsModal).toContainText('Check Our Docs');
  });
});
