import { test } from '@affine-test/kit/electron';
import {
  expectActiveTab,
  expectTabTitle,
} from '@affine-test/kit/utils/app-tabs';
import {
  clickNewPageButton,
  createLinkedPage,
  dragTo,
  getPageByTitle,
  waitForAllPagesLoad,
} from '@affine-test/kit/utils/page-logic';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
import { expect } from '@playwright/test';

test('open split view', async ({ page }) => {
  await clickNewPageButton(page);
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await createLinkedPage(page, 'hi from another page');
  await page
    .locator('.affine-reference-title:has-text("hi from another page")')
    .click({
      modifiers: ['ControlOrMeta', 'Alt'],
    });
  await expect(page.locator('.doc-title-container')).toHaveCount(2);

  // check tab title
  await expect(page.getByTestId('split-view-label')).toHaveCount(2);
  await expectTabTitle(page, 0, ['Untitled', 'hi from another page']);

  // the first split view should be active
  await expectActiveTab(page, 0, 0);

  // by clicking the first split view label, the first split view should be active
  await page.getByTestId('split-view-label').nth(0).click();
  await expectActiveTab(page, 0, 0);
  await expect(page.getByTestId('split-view-indicator').nth(0)).toHaveAttribute(
    'data-active',
    'true'
  );

  const firstDragHandle = page
    .getByTestId('split-view-panel')
    .first()
    .getByTestId('split-view-indicator');

  await dragTo(
    page,
    firstDragHandle,
    page.getByTestId('split-view-panel').last(),
    'center',
    true
  );

  await expectTabTitle(page, 0, ['hi from another page', 'Untitled']);
});

test('open split view in all docs (operations button)', async ({ page }) => {
  const testTitle = 'test-page';
  await clickNewPageButton(page, testTitle);
  await clickSideBarAllPageButton(page);
  await waitForAllPagesLoad(page);
  await getPageByTitle(page, testTitle)
    .getByTestId('doc-list-operation-button')
    .click();
  await page.getByRole('menuitem', { name: 'Open in split view' }).click();
  await expect(page.getByTestId('split-view-panel')).toHaveCount(2);
  const targetPage = page.getByTestId('split-view-panel').last();
  await expect(targetPage).toHaveAttribute('data-is-active', 'true');
  await expect(targetPage.locator('.doc-title-container')).toBeVisible();
  await expect(targetPage.locator('.doc-title-container')).toContainText(
    testTitle
  );
});

test('open split view in all docs (drag to resize handle)', async ({
  page,
}) => {
  const testTitle = 'test-page';
  await clickNewPageButton(page, testTitle);
  await clickSideBarAllPageButton(page);
  await waitForAllPagesLoad(page);

  const pageItem = getPageByTitle(page, testTitle);

  const leftResizeHandle = page.getByTestId('resize-handle').first();

  await dragTo(page, pageItem, leftResizeHandle, 'center');
  await expectTabTitle(page, 0, ['test-page', 'All docs']);
});

test('creating split view by dragging sidebar journals', async ({ page }) => {
  const journalButton = page.getByTestId('slider-bar-journals-button');
  const leftResizeHandle = page.getByTestId('resize-handle').first();

  await dragTo(page, journalButton, leftResizeHandle, 'center');
  await expect(page.getByTestId('split-view-panel')).toHaveCount(2);
  await expect(
    page
      .getByTestId('split-view-panel')
      .filter({
        has: page.locator('[data-is-first="true"]'),
      })
      .getByTestId('date-today-label')
  ).toBeVisible();
});
