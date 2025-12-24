import { test } from '@affine-test/kit/playwright';
import {
  clickEdgelessModeButton,
  clickPageModeButton,
  createEdgelessNoteBlock,
} from '@affine-test/kit/utils/editor';
import {
  pressBackspace,
  pressEnter,
  selectAllByKeyboard,
} from '@affine-test/kit/utils/keyboard';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  createLinkedPage,
  type,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect, type Locator, type Page } from '@playwright/test';

import {
  createHeadings,
  createTitle,
  getVerticalCenterFromLocator,
} from './utils';

function getIndicators(container: Page | Locator) {
  return container.locator('affine-outline-viewer .outline-viewer-indicator');
}

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await clickNewPageButton(page);
  await waitForEditorLoad(page);
});

test('should display indicators when non-empty headings exists', async ({
  page,
}) => {
  const indicators = getIndicators(page);
  await createHeadings(page);

  await expect(indicators).toHaveCount(6);
  for (let i = 0; i < 6; i++) {
    await expect(indicators.nth(i)).toBeVisible();
  }
});

test('should be hidden when only empty headings exists', async ({ page }) => {
  const indicators = getIndicators(page);
  await expect(indicators).toHaveCount(0);

  for (let i = 1; i <= 6; i++) {
    // empty heading
    await type(page, `${'#'.repeat(i)} `);
    await pressEnter(page);
  }

  await expect(indicators).toHaveCount(0);
});

test('should update indicator when clear title or headings', async ({
  page,
}) => {
  const indicators = getIndicators(page);
  const title = await createTitle(page);
  const headings = await createHeadings(page);

  await expect(indicators).toHaveCount(7);

  await title.scrollIntoViewIfNeeded();
  await title.click();
  await selectAllByKeyboard(page);
  await pressBackspace(page);
  await expect(indicators).toHaveCount(6);

  for (let i = 1; i <= 6; i++) {
    await headings[i - 1].click();
    await selectAllByKeyboard(page);
    await pressBackspace(page);
    await expect(indicators).toHaveCount(6 - i);
  }
});

test('should display simple outline panel when hovering over indicators', async ({
  page,
}) => {
  const indicators = getIndicators(page);
  await createTitle(page);
  await createHeadings(page);
  await indicators.first().hover({ force: true });

  const items = page.locator('.outline-viewer-item');
  await expect(items).toHaveCount(8);
  await expect(items.nth(0)).toContainText(['Table of Contents']);
  await expect(items.nth(1)).toContainText(['Title']);
  for (let i = 2; i <= 7; i++) {
    await expect(items.nth(i)).toContainText([`Heading ${i - 1}`]);
  }
});

test('should highlight indicator when scrolling', async ({ page }) => {
  const indicators = getIndicators(page);
  const title = await createTitle(page);
  for (let i = 1; i <= 3; i++) {
    await pressEnter(page);
  }
  const headings = await createHeadings(page, 10);
  await title.scrollIntoViewIfNeeded();

  const viewportCenter = await getVerticalCenterFromLocator(
    page.locator('body')
  );
  for (let i = 0; i < headings.length; i++) {
    const lastHeadingCenter = await getVerticalCenterFromLocator(headings[i]);
    await expect(indicators.nth(i)).toHaveClass(/active/);
    await page.mouse.wheel(0, lastHeadingCenter - viewportCenter + 20);
    await page.waitForTimeout(10);
  }
});

test('should highlight indicator when click item in outline panel', async ({
  page,
}) => {
  const viewer = page.locator('affine-outline-viewer');
  const indicators = getIndicators(page);
  const headings = await createHeadings(page, 10);

  await indicators.first().hover({ force: true });

  const headingsInPanel = Array.from({ length: 6 }, (_, i) =>
    viewer.getByTestId(`outline-block-preview-h${i + 1}`)
  );
  await headingsInPanel[2].click();
  await expect(headings[2]).toBeVisible();
  await expect(indicators.nth(2)).toHaveClass(/active/);
});

test('outline viewer should hide in edgeless mode', async ({ page }) => {
  await createTitle(page);
  await pressEnter(page);

  await type(page, '# ');
  await type(page, 'Heading 1');

  const indicators = getIndicators(page);
  await expect(indicators).toHaveCount(2);

  await clickEdgelessModeButton(page);
  await expect(indicators).toHaveCount(0);

  await clickPageModeButton(page);
  await expect(indicators).toHaveCount(2);
});

test('should hide edgeless-only note headings', async ({ page }) => {
  await createTitle(page);
  await pressEnter(page);
  await type(page, '# Heading 1');
  await pressEnter(page);
  await type(page, '## Heading 2');

  await clickEdgelessModeButton(page);
  await createEdgelessNoteBlock(page, [100, 100]);
  await type(page, '# Edgeless');

  await clickPageModeButton(page);
  await waitForEditorLoad(page);
  const indicators = getIndicators(page);
  await expect(indicators).toHaveCount(3);
  await indicators.first().hover({ force: true });

  const viewer = page.locator('affine-outline-viewer');
  await expect(viewer).toBeVisible();
  const h1InPanel = viewer
    .getByTestId('outline-block-preview-h1')
    .locator('span');
  await h1InPanel.waitFor({ state: 'visible' });
  await expect(h1InPanel).toContainText(['Heading 1']);
});

test('outline viewer should update after change heading in edgeless mode', async ({
  page,
}) => {
  await createTitle(page);
  await pressEnter(page);

  await type(page, '# ');
  await type(page, 'Heading 1');

  await clickEdgelessModeButton(page);
  const note = page.locator('affine-edgeless-note');
  await note.dblclick();
  await type(page, '# New Heading');
  await clickPageModeButton(page);

  const indicators = getIndicators(page);
  await expect(indicators).toHaveCount(3);
});

test('outline viewer should be useable in doc peek preview', async ({
  page,
}) => {
  await pressEnter(page);
  await createLinkedPage(page, 'Test Page');

  await page.locator('affine-reference').hover();

  const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
  await expect(toolbar).toBeVisible();

  await toolbar.getByLabel(/^Open doc with$/).click();
  await toolbar
    .getByLabel('Open doc menu')
    .getByLabel('Open in center peek')
    .click();

  const peekView = page.getByTestId('peek-view-modal');
  await expect(peekView).toBeVisible();

  const title = peekView.locator('doc-title .inline-editor');
  await title.click();
  await pressEnter(page);

  await type(page, '# Heading 1');

  for (let i = 0; i < 10; i++) {
    await pressEnter(page);
  }

  await type(page, '## Heading 2');

  const outlineViewer = peekView.locator('affine-outline-viewer');
  const outlineViewerBound = await outlineViewer.boundingBox();
  expect(outlineViewerBound).not.toBeNull();

  const indicators = getIndicators(peekView);
  await expect(indicators).toHaveCount(3);
  await expect(indicators.nth(0)).toBeVisible();
  await expect(indicators.nth(1)).toBeVisible();
  await expect(indicators.nth(2)).toBeVisible();

  await indicators.first().hover({ force: true });
  const viewer = peekView.locator('affine-outline-viewer');
  await expect(viewer).toBeVisible();

  // position of outline viewer should be fixed
  {
    const headingButtons = peekView.locator(
      'affine-outline-viewer .outline-viewer-item:not(.outline-viewer-header)'
    );
    await expect(headingButtons).toHaveCount(3);
    await expect(headingButtons.nth(0)).toBeVisible();
    await expect(headingButtons.nth(1)).toBeVisible();
    await expect(headingButtons.nth(2)).toBeVisible();

    await headingButtons.last().click();
    await page.mouse.move(0, 0);
    await headingButtons.last().waitFor({ state: 'hidden' });

    const currentOutlineViewerBound = await outlineViewer.boundingBox();
    expect(currentOutlineViewerBound).not.toBeNull();
    expect(outlineViewerBound).toEqual(currentOutlineViewerBound);
  }

  // outline viewer should be hidden when clicking the outline panel toggle button
  {
    await indicators.first().hover({ force: true });
    const toggleButton = peekView.locator(
      '.outline-viewer-header edgeless-tool-icon-button'
    );
    await toggleButton.click();

    await page.waitForTimeout(500);
    await expect(peekView).toBeHidden();
    await expect(viewer).toBeHidden();
    await expect(page.locator('affine-outline-panel')).toBeVisible();
  }
});
