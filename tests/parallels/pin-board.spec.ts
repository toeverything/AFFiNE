import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { clickPageMoreActions, newPage } from '../libs/page-logic';
import { test } from '../libs/playwright';

async function createRootPage(page: Page, title: string) {
  await newPage(page);
  await page.focus('.affine-default-page-block-title');
  await page.type('.affine-default-page-block-title', title, {
    delay: 100,
  });
  await clickPageMoreActions(page);
  await page.getByTestId('move-to-menu-item').click();
  await page.getByTestId('root-pivot-button-in-pivots-menu').click();
}
async function createPivotPage(page: Page, title: string, parentTitle: string) {
  await newPage(page);
  await page.focus('.affine-default-page-block-title');
  await page.type('.affine-default-page-block-title', title, {
    delay: 100,
  });
  await clickPageMoreActions(page);
  await page.getByTestId('move-to-menu-item').click();
  await page.getByTestId('pivots-menu').getByText(parentTitle).click();
}
export async function initPinBoard(page: Page) {
  await openHomePage(page);
  await createRootPage(page, 'parent1');
  await createRootPage(page, 'parent2');
  await createPivotPage(page, 'child1', 'parent1');
  await createPivotPage(page, 'child2', 'parent1');
}
test.describe('PinBoard interaction', () => {
  test('Add pivot', async ({ page }) => {
    await initPinBoard(page);
  });
  test('Remove pivots', async ({ page }) => {
    await initPinBoard(page);

    const child2Meta = await page.evaluate(() => {
      return globalThis.currentWorkspace.blockSuiteWorkspace.meta.pageMetas.find(
        m => m.title === 'child2'
      );
    });

    const child2 = await page
      .getByTestId('sidebar-pivots-container')
      .getByTestId(`pivot-${child2Meta?.id}`);
    await child2.hover();
    await child2.getByTestId('pivot-operation-button').click();
    await page.getByTestId('pivot-operation-move-to').click();
    await page.getByTestId('remove-from-pivots-button').click();
    await page.waitForTimeout(1000);
    expect(
      await page.locator(`[data-testid="pivot-${child2Meta.id}"]`).count()
    ).toEqual(0);
  });

  test('search pivot', async ({ page }) => {
    await initPinBoard(page);

    const child2Meta = await page.evaluate(() => {
      return globalThis.currentWorkspace.blockSuiteWorkspace.meta.pageMetas.find(
        m => m.title === 'child2'
      );
    });

    const child2 = await page
      .getByTestId('sidebar-pivots-container')
      .getByTestId(`pivot-${child2Meta?.id}`);
    await child2.hover();
    await child2.getByTestId('pivot-operation-button').click();
    await page.getByTestId('pivot-operation-move-to').click();

    await page.fill('[data-testid="pivots-menu-search"]', '111');
    expect(await page.locator('[alt="no result"]').count()).toEqual(1);

    await page.fill('[data-testid="pivots-menu-search"]', 'parent2');
    expect(
      await page.locator('[data-testid="pivot-search-result"]').count()
    ).toEqual(1);
  });
});
