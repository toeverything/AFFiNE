import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { clickPageMoreActions, newPage } from '../libs/page-logic';
import { test } from '../libs/playwright';
import { getMetas } from '../libs/utils';

async function createPinboardPage(page: Page, parentId: string, title: string) {
  await newPage(page);
  await page.focus('.affine-default-page-block-title');
  await page.type('.affine-default-page-block-title', title, {
    delay: 100,
  });
  await clickPageMoreActions(page);
  await page.getByTestId('move-to-menu-item').click();
  await page
    .getByTestId('pinboard-menu')
    .getByTestId(`pinboard-${parentId}`)
    .click();
}

async function initHomePageWithPinboard(page: Page) {
  await openHomePage(page);
  await page.waitForSelector('[data-testid="sidebar-pinboard-container"]');
  return (await getMetas(page)).find(m => m.isRootPinboard);
}

test.describe('PinBoard interaction', () => {
  test('Have initial root pinboard page when first in', async ({ page }) => {
    const rootPinboardMeta = await initHomePageWithPinboard(page);
    expect(rootPinboardMeta).not.toBeUndefined();
  });

  test('Click Pinboard in sidebar should open root pinboard page', async ({
    page,
  }) => {
    const rootPinboardMeta = await initHomePageWithPinboard(page);
    await page.getByTestId(`pinboard-${rootPinboardMeta?.id}`).click();
    await page.waitForTimeout(200);
    expect(await page.locator('affine-editor-container')).not.toBeNull();
  });

  test('Add pinboard by header operation menu', async ({ page }) => {
    const rootPinboardMeta = await initHomePageWithPinboard(page);
    await createPinboardPage(page, rootPinboardMeta?.id ?? '', 'test1');
    const meta = (await getMetas(page)).find(m => m.title === 'test1');
    expect(meta).not.toBeUndefined();
    expect(
      await page
        .getByTestId('[data-testid="sidebar-pinboard-container"]')
        .getByTestId(`pinboard-${meta?.id}`)
    ).not.toBeNull();
  });

  test('Remove from pinboard', async ({ page }) => {
    const rootPinboardMeta = await initHomePageWithPinboard(page);
    await createPinboardPage(page, rootPinboardMeta?.id ?? '', 'test1');
    const childMeta = (await getMetas(page)).find(m => m.title === 'test1');

    const child = await page
      .getByTestId('sidebar-pinboard-container')
      .getByTestId(`pinboard-${childMeta?.id}`);
    await child.hover();
    await child.getByTestId('pinboard-operation-button').click();
    await page.getByTestId('pinboard-operation-move-to').click();
    await page.getByTestId('remove-from-pinboard-button').click();
    await page.waitForTimeout(1000);
    expect(
      await page.locator(`[data-testid="pinboard-${childMeta?.id}"]`).count()
    ).toEqual(0);
  });

  test('search pinboard', async ({ page }) => {
    const rootPinboardMeta = await initHomePageWithPinboard(page);
    await createPinboardPage(page, rootPinboardMeta?.id ?? '', 'test1');
    const childMeta = (await getMetas(page)).find(m => m.title === 'test1');

    const child = await page
      .getByTestId('sidebar-pinboard-container')
      .getByTestId(`pinboard-${childMeta?.id}`);
    await child.hover();
    await child.getByTestId('pinboard-operation-button').click();
    await page.getByTestId('pinboard-operation-move-to').click();

    await page.fill('[data-testid="pinboard-menu-search"]', '111');
    expect(await page.locator('[alt="no result"]').count()).toEqual(1);

    await page.fill('[data-testid="pinboard-menu-search"]', 'test1');
    expect(
      await page.locator('[data-testid="pinboard-search-result"]').count()
    ).toEqual(1);
  });
});
