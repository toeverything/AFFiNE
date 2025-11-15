import { test } from '@affine-test/kit/playwright';
import {
  clickEdgelessModeButton,
  clickView,
  createEdgelessNoteBlock,
  fitViewportToContent,
  focusDocTitle,
  getSelectedXYWH,
  locateEditorContainer,
  resizeElementByHandle,
  scaleElementByHandle,
} from '@affine-test/kit/utils/editor';
import { pressEnter } from '@affine-test/kit/utils/keyboard';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  createLinkedPage,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

const title = 'Synced Block Test';

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page, title);
  await pressEnter(page);
  await page.keyboard.type('test content');
  await clickEdgelessModeButton(page);
  const container = locateEditorContainer(page);
  await container.click();
});

test('should not show hidden note in embed view page mode', async ({
  page,
}) => {
  const note = page.locator('affine-edgeless-note');
  await note.dblclick();
  await page.keyboard.type('visible content');
  await createEdgelessNoteBlock(page, [100, 100]);
  await page.keyboard.press('Enter');
  await page.keyboard.type('hidden content');
  await page.keyboard.press('Enter');

  // create a new page and navigate
  await createLinkedPage(page, 'Test Page');
  const inlineLink = page.locator('affine-reference');
  await inlineLink.dblclick();

  // reference the previous page
  await focusDocTitle(page);
  await page.keyboard.press('Enter');
  await page.keyboard.type('@' + title);
  const docPopover = page.locator('.linked-doc-popover');
  await docPopover.getByText(/^Synced Block Test$/).click();

  // switch to embed view
  await inlineLink.hover();
  const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
  await toolbar.getByLabel('Switch view').click();
  await toolbar.getByLabel('Embed view').click();

  // check the content
  const embedLink = page.locator('affine-embed-synced-doc-block');
  await expect(embedLink.getByText(/visible content/)).toBeVisible();
  await expect(embedLink.getByText(/hidden content/)).toBeHidden();
});

test.describe('edgeless', () => {
  test.beforeEach(async ({ page }) => {
    await clickNewPageButton(page);
    await clickEdgelessModeButton(page);
    await clickView(page, [0, 0]);
    await page.keyboard.type('@' + title);
    await page
      .getByTestId('cmdk-quick-search')
      .getByText(/^Synced Block Test$/)
      .click();

    await fitViewportToContent(page);
  });

  test.describe('header of edgeless embed synced doc', () => {
    test('should fold button works', async ({ page }) => {
      const embedBlock = page.locator('affine-embed-edgeless-synced-doc-block');
      const foldButton = embedBlock.getByTestId(
        'edgeless-embed-synced-doc-fold-button'
      );
      const content = embedBlock.locator('editor-host');

      await expect(foldButton).toHaveAttribute('data-folded', 'false');
      await expect(content).toBeInViewport();

      await foldButton.click();

      await expect(content).not.toBeInViewport();
      await expect(foldButton).toHaveAttribute('data-folded', 'true');
    });

    test('should show title in header', async ({ page }) => {
      const embedBlock = page.locator('affine-embed-edgeless-synced-doc-block');
      const headerTitle = embedBlock.getByTestId(
        'edgeless-embed-synced-doc-title'
      );
      await expect(headerTitle).toHaveText(title);
    });
  });

  test.describe('size adjustment of embed synced doc', () => {
    test.beforeEach(async ({ page }) => {
      await scaleElementByHandle(page, [10, 10], 'bottom-right');
    });

    test('should fold embed synced doc when adjust height to smallest', async ({
      page,
    }) => {
      const [, , , h] = await getSelectedXYWH(page);
      await resizeElementByHandle(page, [0, -(h - 10)], 'bottom-right');

      const embedBlock = page.locator('affine-embed-edgeless-synced-doc-block');
      const foldButton = embedBlock.getByTestId(
        'edgeless-embed-synced-doc-fold-button'
      );
      const content = embedBlock.locator('editor-host');

      await expect(foldButton).toHaveAttribute('data-folded', 'true');
      await expect(content).not.toBeInViewport();

      await foldButton.click();
      await expect(foldButton).toHaveAttribute('data-folded', 'false');
      await expect(content).toBeInViewport();

      await embedBlock.click();
      const [, , , h2] = await getSelectedXYWH(page);
      expect(
        h2,
        'should recover height when unfold embed synced doc which was resized to smallest height directly'
      ).toEqual(h);
    });

    test('should be able to adjust height the folded embed synced doc', async ({
      page,
    }) => {
      const embedBlock = page.locator('affine-embed-edgeless-synced-doc-block');

      const content = embedBlock.locator('editor-host');
      const foldButton = embedBlock.getByTestId(
        'edgeless-embed-synced-doc-fold-button'
      );
      await foldButton.click();

      await resizeElementByHandle(page, [50, 0], 'bottom-right');
      await expect(content).not.toBeInViewport();
      await expect(foldButton).toHaveAttribute('data-folded', 'true');

      await resizeElementByHandle(page, [-50, 0], 'bottom-right');
      await expect(content).not.toBeInViewport();
      await expect(foldButton).toHaveAttribute('data-folded', 'true');

      await resizeElementByHandle(page, [0, 50], 'bottom-right');
      await expect(
        content,
        'should unfold the embed synced doc when adjust height to greater'
      ).toBeInViewport();
      await expect(foldButton).toHaveAttribute('data-folded', 'false');
      await expect(content).toBeInViewport();
    });
  });
});
