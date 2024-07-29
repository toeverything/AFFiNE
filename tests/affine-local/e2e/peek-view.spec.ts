import { test } from '@affine-test/kit/playwright';
import {
  clickEdgelessModeButton,
  clickPageModeButton,
} from '@affine-test/kit/utils/editor';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  createLinkedPage,
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

  await expect(
    page.locator('.affine-reference-popover-container')
  ).toBeVisible();

  // click more button
  await page
    .locator('editor-menu-button editor-icon-button[aria-label="Open doc"]')
    .click();
  await page
    .locator('editor-menu-action:has-text("Open in center peek")')
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
  await expect(
    page.locator('.affine-reference-popover-container')
  ).toBeVisible();

  await page
    .locator('editor-menu-button editor-icon-button[aria-label="Switch view"]')
    .click();
  await page
    .locator('editor-menu-button editor-menu-action[aria-label="Card view"]')
    .click();

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

test('can open peek view for embedded frames', async ({ page }) => {
  await page.keyboard.press('Enter');

  // create a frame
  await page.keyboard.insertText('```frame\nTest Frame\n```');

  await clickEdgelessModeButton(page);

  // select the note
  await page
    .locator('affine-edgeless-note:has-text("Test Frame")')
    .click({ force: true });
  // enter F to create a frame
  await page.keyboard.press('f');

  // close affine-banner
  await page.locator('[data-testid=local-demo-tips-close-button]').click();

  // insert the frame to page
  await page
    .locator('edgeless-change-frame-button:has-text("Insert into Page")')
    .click();

  // switch back to page mode
  await clickPageModeButton(page);

  // hover the frame to trigger surface-ref-toolbar
  await page.locator('affine-surface-ref .affine-surface-ref').hover();

  await page
    .locator('.surface-ref-toolbar-container')
    .locator('editor-icon-button[aria-label="Open doc"]')
    .click();

  await page
    .locator('.surface-ref-toolbar-container')
    .locator('editor-menu-action:has-text("center peek")')
    .click();

  // verify peek view is opened
  await expect(page.getByTestId('peek-view-modal')).toBeVisible();

  // check if page is in edgeless mode
  await expect(
    page.locator('edgeless-editor').locator('affine-frame')
  ).toBeInViewport();

  // close peek view
  await page.keyboard.press('Escape');

  // check if can open peek view by shift+click
  await page
    .locator('affine-surface-ref .affine-surface-ref')
    .click({ modifiers: ['Shift'] });

  // check if page is in edgeless mode
  await expect(
    page.locator('edgeless-editor').locator('affine-frame')
  ).toBeInViewport();

  // close peek view
  await page.keyboard.press('Escape');

  // check if can open peek view by double click
  await page.locator('affine-surface-ref .affine-surface-ref').dblclick();
  // check if page is in edgeless mode
  await expect(
    page.locator('edgeless-editor').locator('affine-frame')
  ).toBeInViewport();

  // can close modal when navigate
  await openHomePage(page);
  await expect(page.getByTestId('peek-view-modal')).not.toBeVisible();
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
