import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  dragTo,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
import { getCurrentDocIdFromUrl } from '@affine-test/kit/utils/url';
import { expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
});

test('unlink a linked doc from the sidebar context menu', async ({ page }) => {
  // the currently opened doc (Getting Started) becomes the parent
  const parentId = getCurrentDocIdFromUrl(page);

  // pin the parent into Favorites so it appears as a sidebar doc node
  await clickSideBarAllPageButton(page);
  await page.waitForTimeout(500);
  await dragTo(
    page,
    page.locator('[data-testid="doc-list-item"]').first(),
    page.getByTestId('navigation-panel-favorite-category-divider')
  );
  const parentNode = page.getByTestId(`navigation-panel-doc-${parentId}`);
  await expect(parentNode).toBeVisible({ timeout: 5000 });

  // create the child page
  const childTitle = 'child page to unlink';
  await clickNewPageButton(page, childTitle);
  const childId = getCurrentDocIdFromUrl(page);
  expect(childId).not.toBe(parentId);

  // drag the child from the All Docs list onto the parent sidebar node
  await clickSideBarAllPageButton(page);
  await page.waitForTimeout(500);
  await dragTo(
    page,
    page.locator(`[data-testid="doc-list-item"]:has-text("${childTitle}")`),
    parentNode
  );
  // linking is async (guard check + content write + search index update)
  await page.waitForTimeout(3000);

  // the parent auto-expands on a make-child drop; only expand manually if
  // the linked child is not already visible
  const linkedChild = parentNode.locator(
    `[data-testid="navigation-panel-doc-${childId}"]`
  );
  if ((await linkedChild.count()) === 0) {
    await parentNode
      .getByTestId('navigation-panel-collapsed-button')
      .first()
      .click();
    await page.waitForTimeout(2000);
  }
  await expect(linkedChild).toBeVisible({ timeout: 8000 });

  // right-click the linked child and choose "Unlink"
  await linkedChild.click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Unlink' }).click();
  await page.waitForTimeout(1000);

  // the linked child is gone from the parent...
  await expect(
    parentNode.locator(`[data-testid="navigation-panel-doc-${childId}"]`)
  ).toHaveCount(0);

  // ...but the doc itself is not deleted: it is still in the All Docs list
  await clickSideBarAllPageButton(page);
  await expect(
    page.locator(`[data-testid="doc-list-item"]:has-text("${childTitle}")`)
  ).toBeVisible();
});
