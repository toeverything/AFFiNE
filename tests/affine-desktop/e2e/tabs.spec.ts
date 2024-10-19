import { test } from '@affine-test/kit/electron';
import {
  clickNewPageButton,
  createLinkedPage,
  dragTo,
} from '@affine-test/kit/utils/page-logic';
import { clickSideBarAllPageButton } from '@affine-test/kit/utils/sidebar';
import { expect, type Page } from '@playwright/test';

async function expectActiveTab(page: Page, index: number, activeViewIndex = 0) {
  await expect(
    page
      .getByTestId('workbench-tab')
      .nth(index)
      .getByTestId('split-view-label')
      .nth(activeViewIndex)
  ).toHaveAttribute('data-active', 'true');
}

async function expectTabTitle(
  page: Page,
  index: number,
  title: string | string[]
) {
  if (typeof title === 'string') {
    await expect(page.getByTestId('workbench-tab').nth(index)).toContainText(
      title
    );
  } else {
    for (let i = 0; i < title.length; i++) {
      await expect(
        page
          .getByTestId('workbench-tab')
          .nth(index)
          .getByTestId('split-view-label')
          .nth(i)
      ).toContainText(title[i]);
    }
  }
}

async function expectTabCount(page: Page, count: number) {
  await expect(page.getByTestId('workbench-tab')).toHaveCount(count);
}

async function closeTab(page: Page, index: number) {
  await page.getByTestId('workbench-tab').nth(index).hover();

  await page
    .getByTestId('workbench-tab')
    .nth(index)
    .getByTestId('close-tab-button')
    .click();
}

test('create new tab', async ({ views }) => {
  let page = await views.getActive();

  await page.getByTestId('add-tab-view-button').click();
  await expectTabCount(page, 2);
  // new tab title should be All docs
  await expectTabTitle(page, 1, 'All docs');
  await expectActiveTab(page, 1);
  page = await views.getActive();
  // page content should be at all docs page
  await expect(page.getByTestId('virtualized-page-list')).toContainText(
    'All docs'
  );
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
  await sliderBarArea.hover();
  await page.mouse.move(600, 500);
  await page.waitForTimeout(5000);
  await expect(sliderBarArea).not.toBeInViewport();
});

test('Expand Sidebar', async ({ page }) => {
  await page
    .locator('[data-testid=app-sidebar-arrow-button-collapse][data-show=true]')
    .click();
  const sliderBarArea = page.getByTestId('app-sidebar');
  await sliderBarArea.hover();
  await page.mouse.move(600, 500);
  await page.waitForTimeout(5000);
  await expect(sliderBarArea).not.toBeInViewport();

  await page
    .locator('[data-testid=app-sidebar-arrow-button-expand][data-show=true]')
    .click();
  await expect(sliderBarArea).toBeInViewport();
});

test('tab title will change when navigating', async ({ page }) => {
  await expectTabTitle(page, 0, 'Write, Draw, Plan all at Once');

  // create new page
  await clickNewPageButton(page);
  await expectTabTitle(page, 0, 'Untitled');

  // go to all page
  await page.getByTestId('all-pages').click();
  await expectTabTitle(page, 0, 'All docs');

  // go to today's journal
  await page.getByTestId('slider-bar-journals-button').click();
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

  // the second split view should be active
  await expectActiveTab(page, 0, 1);

  // by clicking the first split view label, the first split view should be active
  await page.getByTestId('split-view-label').nth(0).click();
  await expectActiveTab(page, 0, 0);
  await expect(page.getByTestId('split-view-indicator').nth(0)).toHaveAttribute(
    'data-active',
    'true'
  );
});

test('drag a page from "All pages" list to tabs header', async ({ page }) => {
  const title = 'this is a new page to drag';
  await clickNewPageButton(page, title);
  await clickSideBarAllPageButton(page);

  await dragTo(
    page,
    page.locator(`[data-testid="page-list-item"]:has-text("${title}")`),
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
