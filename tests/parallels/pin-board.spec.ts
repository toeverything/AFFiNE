import { test } from '@affine-test/kit/playwright';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { initHomePageWithPinboard } from '../libs/load-page';
import { createPinboardPage } from '../libs/page-logic';
import { getMetas } from '../libs/utils';

async function openPinboardPageOperationMenu(page: Page, id: string) {
  const node = await page
    .getByTestId('sidebar-pinboard-container')
    .getByTestId(`pinboard-${id}`);
  await node.hover();
  await node.getByTestId('pinboard-operation-button').click();
}

async function checkIsChildInsertToParentInEditor(page: Page, pageId: string) {
  await page
    .getByTestId('sidebar-pinboard-container')
    .getByTestId(`pinboard-${pageId}`)
    .click();
  await page.waitForTimeout(200);
  const referenceLink = await page.locator('.affine-reference');
  expect(referenceLink).not.toBeNull();
}

test('Have initial root pinboard page when first in', async ({ page }) => {
  const rootPinboardMeta = await initHomePageWithPinboard(page);
  expect(rootPinboardMeta).not.toBeUndefined();
});

test('Root pinboard page have no operation of "trash" ,"rename" and "move to"', async ({
  page,
}) => {
  const rootPinboardMeta = await initHomePageWithPinboard(page);
  await openPinboardPageOperationMenu(page, rootPinboardMeta?.id ?? '');
  expect(
    await page
      .locator(`[data-testid="pinboard-operation-move-to-trash"]`)
      .count()
  ).toEqual(0);
  expect(
    await page.locator(`[data-testid="pinboard-operation-rename"]`).count()
  ).toEqual(0);
  expect(
    await page.locator(`[data-testid="pinboard-operation-move-to"]`).count()
  ).toEqual(0);
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
  await checkIsChildInsertToParentInEditor(page, rootPinboardMeta?.id ?? '');
});

test('Add pinboard by sidebar operation menu', async ({ page }) => {
  const rootPinboardMeta = await initHomePageWithPinboard(page);

  await openPinboardPageOperationMenu(page, rootPinboardMeta?.id ?? '');
  await page.getByTestId('pinboard-operation-add').click();
  const newPageMeta = (await getMetas(page)).find(
    m => m.id !== rootPinboardMeta?.id
  );
  expect(
    await page
      .getByTestId('sidebar-pinboard-container')
      .getByTestId(`pinboard-${newPageMeta?.id}`)
  ).not.toBeNull();
  await checkIsChildInsertToParentInEditor(page, rootPinboardMeta?.id ?? '');
});

test('Move pinboard to another in sidebar', async ({ page }) => {
  const rootPinboardMeta = await initHomePageWithPinboard(page);
  await createPinboardPage(page, rootPinboardMeta?.id ?? '', 'test1');
  await createPinboardPage(page, rootPinboardMeta?.id ?? '', 'test2');
  const childMeta = (await getMetas(page)).find(m => m.title === 'test1');
  const childMeta2 = (await getMetas(page)).find(m => m.title === 'test2');
  await openPinboardPageOperationMenu(page, childMeta?.id ?? '');
  await page.getByTestId('pinboard-operation-move-to').click();
  await page
    .getByTestId('pinboard-menu')
    .getByTestId(`pinboard-${childMeta2?.id}`)
    .click();
  expect(
    (await getMetas(page)).find(m => m.title === 'test2')?.subpageIds.length
  ).toBe(1);
});

test('Should no show pinboard self in move to menu', async ({ page }) => {
  const rootPinboardMeta = await initHomePageWithPinboard(page);
  await createPinboardPage(page, rootPinboardMeta?.id ?? '', 'test1');
  await createPinboardPage(page, rootPinboardMeta?.id ?? '', 'test2');
  const childMeta = (await getMetas(page)).find(m => m.title === 'test1');

  await page.getByTestId('all-pages').click();
  await page
    .getByTestId(`page-list-item-${childMeta?.id}`)
    .getByTestId('page-list-operation-button')
    .click();
  await page.getByTestId('move-to-menu-item').click();

  expect(
    await page
      .getByTestId('pinboard-menu')
      .locator(`[data-testid="pinboard-${childMeta?.id}"]`)
      .count()
  ).toEqual(0);
});
test('Move pinboard to another in page list', async ({ page }) => {
  const rootPinboardMeta = await initHomePageWithPinboard(page);
  await createPinboardPage(page, rootPinboardMeta?.id ?? '', 'test1');
  await createPinboardPage(page, rootPinboardMeta?.id ?? '', 'test2');
  const childMeta = (await getMetas(page)).find(m => m.title === 'test1');
  const childMeta2 = (await getMetas(page)).find(m => m.title === 'test2');

  await page.getByTestId('all-pages').click();
  await page
    .getByTestId(`page-list-item-${childMeta?.id}`)
    .getByTestId('page-list-operation-button')
    .click();
  await page.getByTestId('move-to-menu-item').click();
  await page
    .getByTestId('pinboard-menu')
    .getByTestId(`pinboard-${childMeta2?.id}`)
    .click();
  expect(
    (await getMetas(page)).find(m => m.title === 'test2')?.subpageIds.length
  ).toBe(1);
});

test('Remove from pinboard', async ({ page }) => {
  const rootPinboardMeta = await initHomePageWithPinboard(page);
  await createPinboardPage(page, rootPinboardMeta?.id ?? '', 'test1');
  const childMeta = (await getMetas(page)).find(m => m.title === 'test1');

  await openPinboardPageOperationMenu(page, childMeta?.id ?? '');

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
  await createPinboardPage(page, rootPinboardMeta?.id ?? '', 'test2');
  const childMeta = (await getMetas(page)).find(m => m.title === 'test1');

  await openPinboardPageOperationMenu(page, childMeta?.id ?? '');

  await page.getByTestId('pinboard-operation-move-to').click();

  await page.fill('[data-testid="pinboard-menu-search"]', '111');
  expect(await page.locator('[alt="no result"]').count()).toEqual(1);

  await page.fill('[data-testid="pinboard-menu-search"]', 'test2');
  expect(
    await page.locator('[data-testid="pinboard-search-result"]').count()
  ).toEqual(1);
});

test('Rename pinboard', async ({ page }) => {
  const rootPinboardMeta = await initHomePageWithPinboard(page);
  await createPinboardPage(page, rootPinboardMeta?.id ?? '', 'test1');
  const childMeta = (await getMetas(page)).find(m => m.title === 'test1');

  await openPinboardPageOperationMenu(page, childMeta?.id ?? '');

  await page.getByTestId('pinboard-operation-rename').click();
  await page.fill(`[data-testid="pinboard-input-${childMeta?.id}"]`, 'test2');

  const title = (await page
    .locator('.affine-default-page-block-title')
    .textContent()) as string;

  expect(title).toEqual('test2');
});

test('Move pinboard to trash', async ({ page }) => {
  const rootPinboardMeta = await initHomePageWithPinboard(page);
  await createPinboardPage(page, rootPinboardMeta?.id ?? '', 'test1');
  const childMeta = (await getMetas(page)).find(m => m.title === 'test1');
  await createPinboardPage(page, childMeta?.id ?? '', 'test2');
  const grandChildMeta = (await getMetas(page)).find(m => m.title === 'test2');

  await openPinboardPageOperationMenu(page, childMeta?.id ?? '');

  await page.getByTestId('pinboard-operation-move-to-trash').click();
  (await page.waitForSelector('[data-testid="move-to-trash-confirm"]')).click();
  await page.waitForTimeout(1000);

  expect(
    await page
      .getByTestId('sidebar-pinboard-container')
      .locator(`[data-testid="pinboard-${childMeta?.id}"]`)
      .count()
  ).toEqual(0);

  expect(
    await page
      .getByTestId('sidebar-pinboard-container')
      .locator(`[data-testid="pinboard-${grandChildMeta?.id}"]`)
      .count()
  ).toEqual(0);
});

// FIXME
test.skip('Copy link', async ({ page }) => {
  const rootPinboardMeta = await initHomePageWithPinboard(page);
  await createPinboardPage(page, rootPinboardMeta?.id ?? '', 'test1');
  const childMeta = (await getMetas(page)).find(m => m.title === 'test1');

  await openPinboardPageOperationMenu(page, childMeta?.id ?? '');

  await page.getByTestId('copy-link').click();

  await page.evaluate(() => {
    const input = document.createElement('input');
    input.id = 'paste-input';
    document.body.appendChild(input);
    input.focus();
  });
  await page.keyboard.press(`Meta+v`, { delay: 50 });
  await page.keyboard.press(`Control+v`, { delay: 50 });
  const copiedValue = await page
    .locator('#paste-input')
    .evaluate((input: HTMLInputElement) => input.value);
  expect(copiedValue).toEqual(page.url());
});
