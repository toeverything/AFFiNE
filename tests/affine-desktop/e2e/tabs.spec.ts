import { test } from '@affine-test/kit/electron';
import {
  closeTab,
  expectActiveTab,
  expectTabCount,
  expectTabTitle,
} from '@affine-test/kit/utils/app-tabs';
import {
  clickNewPageButton,
  createLinkedPage,
  dragTo,
  getPageByTitle,
} from '@affine-test/kit/utils/page-logic';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
import { expect } from '@playwright/test';

test('create new tab', async ({ views }) => {
  let page = await views.getActive();

  await page.getByTestId('add-tab-view-button').click();
  await expectTabCount(page, 2);
  // new tab title should be All docs
  await expectTabTitle(page, 1, 'All docs');
  await expectActiveTab(page, 1);
});

test('can switch & close tab by clicking', async ({ page }) => {
  await page.getByTestId('add-tab-view-button').click();

  await expectActiveTab(page, 1);

  // switch to the previous tab by clicking on it
  await page.getByTestId('workbench-tab').nth(0).click();
  await expectActiveTab(page, 0);

  // switch to the next tab by clicking on it
  await page.getByTestId('workbench-tab').nth(1).click();
  await expectActiveTab(page, 1);

  // close the current tab
  await closeTab(page, 1);

  // the first tab should be active
  await expectActiveTab(page, 0);
});

test('Collapse Sidebar', async ({ page }) => {
  await page
    .locator('[data-testid=app-sidebar-arrow-button-collapse][data-show=true]')
    .click();
  const sliderBarArea = page.getByTestId('app-sidebar');
  await expect(sliderBarArea).not.toBeInViewport();
});

test('Expand Sidebar', async ({ page }) => {
  await page
    .locator('[data-testid=app-sidebar-arrow-button-collapse][data-show=true]')
    .click();
  const sliderBarArea = page.getByTestId('app-sidebar');
  await expect(sliderBarArea).not.toBeInViewport();

  await page
    .locator('[data-testid=app-sidebar-arrow-button-expand][data-show=true]')
    .click();
  await expect(sliderBarArea).toBeInViewport();
});

test('tab title will change when navigating', async ({ page }) => {
  await expectTabTitle(page, 0, 'Getting Started');

  // create new page
  await clickNewPageButton(page);
  await expectTabTitle(page, 0, 'Untitled');

  // go to all page
  await page.getByTestId('all-pages').click();
  await expectTabTitle(page, 0, 'All docs');

  // go to today's journal
  await page.getByTestId('slider-bar-journals-button').click();
  await page.getByTestId('confirm-create-journal-button').click();
  await expect(page.locator('.doc-title-container')).toContainText('Today');
  const dateString = await page
    .locator('.doc-title-container > span:first-of-type')
    .textContent();

  if (dateString) {
    await expectTabTitle(page, 0, dateString);
  }
});

test('open new tab via cmd+click page link', async ({ page }) => {
  await clickNewPageButton(page);
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await createLinkedPage(page, 'hi from another page');
  await page
    .locator('.affine-reference-title:has-text("hi from another page")')
    .click({
      modifiers: ['ControlOrMeta'],
    });
  await expectTabCount(page, 2);
  await expectTabTitle(page, 0, 'Untitled');
  await expectTabTitle(page, 1, 'hi from another page');
  await expectActiveTab(page, 0);
});

test('drag a page from "All pages" list to tabs header', async ({ page }) => {
  const title = 'this is a new page to drag';
  await clickNewPageButton(page, title);
  await clickSideBarAllPageButton(page);

  await dragTo(
    page,
    getPageByTitle(page, title),
    page.getByTestId('add-tab-view-button')
  );

  await expectTabCount(page, 2);
  await expectTabTitle(page, 1, title);
  await expectActiveTab(page, 1);
});

test('reorder tabs', async ({ page }) => {
  await clickNewPageButton(page);
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  const titles = ['aaa', 'bbb'];
  await createLinkedPage(page, titles[0]);
  await createLinkedPage(page, titles[1]);
  await page.locator(`.affine-reference-title:has-text("${titles[0]}")`).click({
    modifiers: ['ControlOrMeta'],
  });
  await page.locator(`.affine-reference-title:has-text("${titles[1]}")`).click({
    modifiers: ['ControlOrMeta'],
  });

  await expectTabTitle(page, 0, 'Untitled');
  await expectTabTitle(page, 1, titles[0]);
  await expectTabTitle(page, 2, titles[1]);

  await dragTo(
    page,
    page.getByTestId('workbench-tab').nth(0),
    page.getByTestId('workbench-tab').nth(1),
    'right'
  );

  await expectTabTitle(page, 0, titles[0]);
  await expectTabTitle(page, 1, 'Untitled');
  await expectTabTitle(page, 2, titles[1]);
});
