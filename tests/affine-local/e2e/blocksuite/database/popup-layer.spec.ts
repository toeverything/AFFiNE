import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

import {
  createDatabaseBlock,
  createNewPage,
  gotoContentFromTitle,
} from './utils';

test('database view options menu paints above the bi-directional links button', async ({
  page,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await createNewPage(page);
  await gotoContentFromTitle(page);
  await createDatabaseBlock(page);

  await page.locator('affine-database').hover();
  await page.locator('.affine-database-toolbar-item.more-action').click();
  const menu = page.locator('affine-menu').first();
  await expect(menu).toBeVisible();

  const button = (await page
    .getByRole('button', { name: /^(Show|Hide)$/ })
    .boundingBox())!;
  const menuBox = (await menu.boundingBox())!;
  const left = Math.max(button.x, menuBox.x);
  const right = Math.min(button.x + button.width, menuBox.x + menuBox.width);
  const top = Math.max(button.y, menuBox.y);
  const bottom = Math.min(button.y + button.height, menuBox.y + menuBox.height);
  expect(left).toBeLessThan(right);
  expect(top).toBeLessThan(bottom);

  const topmostIsMenu = await page.evaluate(
    ({ x, y }) => !!document.elementFromPoint(x, y)?.closest('affine-menu'),
    { x: (left + right) / 2, y: (top + bottom) / 2 }
  );
  expect(topmostIsMenu).toBe(true);
});
