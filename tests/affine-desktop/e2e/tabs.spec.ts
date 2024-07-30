import { test } from '@affine-test/kit/electron';
import {
  clickNewPageButton,
  createLinkedPage,
} from '@affine-test/kit/utils/page-logic';
import { expect, type Page } from '@playwright/test';

test('create new tab', async ({ views }) => {
  let page = await views.getActive();

  await page.getByTestId('add-tab-view-button').click();
  await expect(page.getByTestId('workbench-tab')).toHaveCount(2);
  // new tab title should be All docs
  await expect(page.getByTestId('workbench-tab').nth(1)).toContainText(
    'All docs'
  );
  page = await views.getActive();
  // page content should be at all docs page
  await expect(page.getByTestId('virtualized-page-list')).toContainText(
    'All Docs'
  );
});

test('can switch & close tab by clicking', async ({ page }) => {
  await page.getByTestId('add-tab-view-button').click();

  await expect(page.getByTestId('workbench-tab').nth(1)).toHaveAttribute(
    'data-active',
    'true'
  );
  // switch to the previous tab by clicking on it
  await page.getByTestId('workbench-tab').nth(0).click();
  await expect(page.getByTestId('workbench-tab').nth(0)).toHaveAttribute(
    'data-active',
    'true'
  );

  // switch to the next tab by clicking on it
  await page.getByTestId('workbench-tab').nth(1).click();
  await expect(page.getByTestId('workbench-tab').nth(1)).toHaveAttribute(
    'data-active',
    'true'
  );

  // close the current tab
  await page
    .getByTestId('workbench-tab')
    .nth(1)
    .getByTestId('close-tab-button')
    .click();

  // the first tab should be active
  await expect(page.getByTestId('workbench-tab').nth(0)).toHaveAttribute(
    'data-active',
    'true'
  );
});

test('can switch tab by CTRL+number', async ({ page }) => {
  test.fixme(); // the shortcut can be only captured by the main process
  await page.keyboard.down('ControlOrMeta+T');
  await expect(page.getByTestId('workbench-tab')).toHaveCount(2);
  await expect(page.getByTestId('workbench-tab').nth(1)).toHaveAttribute(
    'data-active',
    'true'
  );
  // switch to the previous tab by pressing CTRL+1
  await page.locator('body').press('ControlOrMeta+1');
  await expect(page.getByTestId('workbench-tab').nth(0)).toHaveAttribute(
    'data-active',
    'true'
  );
  // switch to the next tab by pressing CTRL+2
  await page.locator('body').press('ControlOrMeta+2');
  await expect(page.getByTestId('workbench-tab').nth(1)).toHaveAttribute(
    'data-active',
    'true'
  );
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
  const sliderBarArea = page.getByTestId('sliderBar-inner');
  await expect(sliderBarArea).not.toBeInViewport();

  await page
    .locator('[data-testid=app-sidebar-arrow-button-expand][data-show=true]')
    .click();
  await expect(sliderBarArea).toBeInViewport();
});

test('tab title will change when navigating', async ({ page }) => {
  await expect(page.getByTestId('workbench-tab')).toContainText(
    'Write, Draw, Plan all at Once'
  );

  // create new page
  await clickNewPageButton(page);
  await expect(page.getByTestId('workbench-tab')).toContainText('Untitled');

  // go to all page
  await page.getByTestId('all-pages').click();
  await expect(page.getByTestId('workbench-tab')).toContainText('All docs');

  // go to today's journal
  await page.getByTestId('slider-bar-journals-button').click();
  await expect(page.locator('.doc-title-container')).toContainText('Today');
  const dateString = await page
    .locator('.doc-title-container > span:first-of-type')
    .textContent();

  if (dateString) {
    await expect(page.getByTestId('workbench-tab')).toContainText(dateString);
  }
});

// temporary way to enable split view
async function enableSplitView(page: Page) {
  await page.evaluate(() => {
    const settingKey = 'affine-settings';
    window.localStorage.setItem(
      settingKey,
      JSON.stringify({
        clientBorder: false,
        fullWidthLayout: false,
        windowFrameStyle: 'frameless',
        fontStyle: 'Serif',
        dateFormat: 'MM/dd/YYYY',
        startWeekOnMonday: false,
        enableBlurBackground: true,
        enableNoisyBackground: true,
        autoCheckUpdate: true,
        autoDownloadUpdate: true,
        enableMultiView: true,
        editorFlags: {},
      })
    );
  });
  await page.reload();
}

test('open split view', async ({ page }) => {
  await enableSplitView(page);
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
  await expect(page.getByTestId('split-view-label').nth(0)).toContainText(
    'Untitled'
  );
  await expect(page.getByTestId('split-view-label').nth(1)).toContainText(
    'hi from another page'
  );

  // the second split view should be active
  await expect(page.getByTestId('split-view-label').nth(1)).toHaveAttribute(
    'data-active',
    'true'
  );

  // by clicking the first split view label, the first split view should be active
  await page.getByTestId('split-view-label').nth(0).click();
  await expect(page.getByTestId('split-view-label').nth(0)).toHaveAttribute(
    'data-active',
    'true'
  );
  await expect(page.getByTestId('split-view-indicator').nth(0)).toHaveAttribute(
    'data-active',
    'true'
  );
});
