import { test } from '@affine-test/kit/playwright';
import {
  clickEdgelessModeButton,
  getSelectedXYWH,
  getViewportBound,
} from '@affine-test/kit/utils/editor';
import { pressEnter, pressEscape } from '@affine-test/kit/utils/keyboard';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  createLinkedPage,
  createSyncedPageInEdgeless,
  type,
  waitForEmptyEditor,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await clickNewPageButton(page);
  await waitForEmptyEditor(page);
});

test('can open peek view via link popover', async ({ page }) => {
  await page.keyboard.press('Enter');
  await createLinkedPage(page, 'Test Page');

  await page.locator('affine-reference').hover();

  const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
  await expect(toolbar).toBeVisible();

  await toolbar.getByLabel(/^Open doc with$/).click();
  await toolbar
    .getByLabel('Open doc menu')
    .getByLabel('Open in center peek')
    .click();

  // verify peek view is opened
  await expect(page.getByTestId('peek-view-modal')).toBeVisible();
  await expect(page.getByTestId('peek-view-modal')).toContainText('Test Page');

  // can use 'esc' to close peek view
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('peek-view-modal')).not.toBeVisible();
});

test('can open peek view via shift+click link', async ({ page }) => {
  await page.keyboard.press('Enter');
  await createLinkedPage(page, 'Test Page');

  await page.locator('affine-reference').click({ modifiers: ['Shift'] });

  // verify peek view is opened
  await expect(page.getByTestId('peek-view-modal')).toBeVisible();
  await expect(page.getByTestId('peek-view-modal')).toContainText('Test Page');

  // can use 'esc' to close peek view
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('peek-view-modal')).not.toBeVisible();
});

test('can open peek view via db+click link card', async ({ page }) => {
  await page.keyboard.press('Enter');
  await createLinkedPage(page, 'Test Page');

  await page.locator('affine-reference').hover();

  const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
  await expect(toolbar).toBeVisible();

  await toolbar.getByLabel('Switch view').click();
  await toolbar.getByLabel('Card view').click();

  await expect(
    page.locator('affine-embed-linked-doc-block:has-text("Test Page")')
  ).toBeVisible();

  // double click to open peek view
  await page.locator('affine-embed-linked-doc-block').dblclick();

  // verify peek view is opened
  await expect(page.getByTestId('peek-view-modal')).toBeVisible();
  await expect(page.getByTestId('peek-view-modal')).toContainText('Test Page');

  // verify peek view can be closed by clicking close button
  await page
    .locator('[data-testid="peek-view-control"][data-action-name="close"]')
    .click();

  await expect(page.getByTestId('peek-view-modal')).not.toBeVisible();

  // double click to open peek view
  await page.locator('affine-embed-linked-doc-block').dblclick();

  // check if open-in-new button works
  await page
    .locator('[data-testid="peek-view-control"][data-action-name="open"]')
    .click();

  // verify page is routed to the linked page
  await expect(
    page
      .getByTestId('main-container')
      .locator('doc-title:has-text("Test Page")')
  ).toBeVisible();
});

test('should not open peek view when content is covered by canvas element', async ({
  page,
}) => {
  await page.keyboard.press('Enter');
  await clickEdgelessModeButton(page);

  await createSyncedPageInEdgeless(page, 'Test Page');

  const syncedDocBlock = await page.locator(
    'affine-embed-edgeless-synced-doc-block'
  );
  const syncedDocRect = (await syncedDocBlock.boundingBox())!;

  await expect(syncedDocBlock).toBeDefined();

  const syncedDocCenter = {
    x: syncedDocRect.x + syncedDocRect.width / 2,
    y: syncedDocRect.y + syncedDocRect.height / 2,
  };

  // click to make sure peek view is working
  await page.mouse.move(syncedDocCenter.x, syncedDocCenter.y, {
    steps: 10,
  });
  await page.mouse.dblclick(syncedDocCenter.x, syncedDocCenter.y);
  await page.waitForTimeout(100);
  await expect(page.getByTestId('peek-view-modal')).toBeVisible();

  // close peek view
  await page
    .locator('[data-testid="peek-view-control"][data-action-name="close"]')
    .click();
  await expect(page.getByTestId('peek-view-modal')).not.toBeVisible();

  // create a shape covering the synced doc block
  await page.locator('edgeless-toolbar-button.edgeless-shape-button').click();
  await page.mouse.move(syncedDocRect.x, syncedDocRect.y);
  await page.mouse.down();
  await page.mouse.move(
    syncedDocRect.x + syncedDocRect.width,
    syncedDocRect.y + syncedDocRect.height,
    {
      steps: 10,
    }
  );
  await page.mouse.up();
  await page.waitForTimeout(100);

  // click the same position again
  await page.mouse.move(syncedDocCenter.x, syncedDocCenter.y, {
    steps: 10,
  });
  await page.mouse.dblclick(syncedDocCenter.x, syncedDocCenter.y);
  // should not open peek view because the synced doc block is covered by shape
  await expect(page.getByTestId('peek-view-modal')).not.toBeVisible();
});

test('can open peek view for embedded frames', async ({ page }) => {
  const frameInViewport = async () => {
    const peekView = page.locator('[data-testid="peek-view-modal"]');
    // wait for peek view ani
    const frameTitle = peekView.locator('edgeless-editor affine-frame-title');
    await frameTitle.waitFor({ state: 'visible' });

    await frameTitle.click();
    const frameXYWH = await getSelectedXYWH(page, 0, 1);
    const viewportBound = await getViewportBound(page, 1);
    return (
      frameXYWH[0] >= viewportBound[0] &&
      frameXYWH[1] >= viewportBound[1] &&
      frameXYWH[0] + frameXYWH[2] <= viewportBound[0] + viewportBound[2] &&
      frameXYWH[1] + frameXYWH[3] <= viewportBound[1] + viewportBound[3]
    );
  };

  await pressEnter(page);

  // create a blank frame using slash command
  await type(page, '/frame');
  await pressEnter(page);

  const surfaceRef = page.locator('affine-surface-ref');
  const peekView = page.locator('[data-testid="peek-view-modal"]');

  await expect(surfaceRef).toBeVisible();
  await surfaceRef.click();
  await surfaceRef.hover();
  await page
    .locator('affine-toolbar-widget editor-menu-button[aria-label="Open"]')
    .click();
  await page
    .locator(
      'affine-toolbar-widget editor-menu-action[aria-label="Open in center peek"]'
    )
    .click();

  await expect(peekView).toBeVisible();
  expect(await frameInViewport()).toBe(true);
  await pressEscape(page);
  await expect(peekView).toBeHidden();

  // check if can open peek view by shift+click
  await surfaceRef.click({ modifiers: ['Shift'] });

  await expect(peekView).toBeVisible();
  expect(await frameInViewport()).toBe(true);
  await pressEscape(page);
  await expect(peekView).toBeHidden();

  // check if can open peek view by double click
  await surfaceRef.dblclick();
  await expect(peekView).toBeVisible();
  expect(await frameInViewport()).toBe(true);
  await pressEscape(page);
  await expect(peekView).toBeHidden();

  // can close modal when navigate
  await openHomePage(page);
  await expect(peekView).toBeHidden();
});

test.skip('can open peek view for fav link', async ({ page }) => {
  // give current page a title
  await page.keyboard.insertText('test page title');
  await page.getByTestId('pin-button').click();
  await expect(page.locator('[data-testid="pin-button"].active')).toBeVisible();

  await page
    .getByTestId('favourites')
    .locator('[data-favourite-page-item]:has-text("test page title")')
    .click({
      modifiers: ['Shift'],
    });

  // verify peek view is opened
  await expect(page.getByTestId('peek-view-modal')).toBeVisible();
  await expect(page.getByTestId('peek-view-modal')).toContainText(
    'test page title'
  );

  // can close modal when navigate
  await openHomePage(page);
  await expect(page.getByTestId('peek-view-modal')).not.toBeVisible();
});
