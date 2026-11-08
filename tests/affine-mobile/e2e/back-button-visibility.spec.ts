import { test } from '@affine-test/kit/mobile';
import { expect, type Page } from '@playwright/test';

import { expandCollapsibleSection, openTab, pageBack } from './utils';

const locateBack = (page: Page) => page.getByTestId('page-header-back');

test('new doc returns to its source without creating a New destination', async ({
  page,
}) => {
  await openTab(page, 'New Page');
  await expect(locateBack(page)).toBeVisible();
  await pageBack(page);
  await expect(page).toHaveURL(/\/home$/);

  await expandCollapsibleSection(page, 'recent');
  const docCard = page.getByTestId('doc-card').first();
  await expect(docCard).toBeVisible();
  await docCard.click();
  await expect(locateBack(page)).toBeVisible();
});

// TODO(@CatsJuice): mobile @ menu is not ready
// test('jump to linked doc should show back', async ({ page }) => {
//   await openTab(page, 'New Page');
//   await expect(locateBack(page)).not.toBeVisible();
//   const docId = await page.evaluate(() => location.pathname.split('/').pop());
//   await page.keyboard.type('Test Doc');
//   await page.keyboard.press('Enter');
//   await page.waitForTimeout(100);
//   await createLinkedPage(page, 'Test Linked Doc');

//   await expect(locateBack(page)).toBeVisible();
// });
