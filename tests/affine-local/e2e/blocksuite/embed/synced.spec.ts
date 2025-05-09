import { test } from '@affine-test/kit/playwright';
import {
  clickEdgelessModeButton,
  clickView,
  createEdgelessNoteBlock,
  fitViewportToContent,
  locateEditorContainer,
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
      await expect(content).toBeVisible();

      await foldButton.click();

      await expect(content).toBeHidden();
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
});
