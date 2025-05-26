import { test } from '@affine-test/kit/playwright';
import {
  importAttachment,
  importFile,
} from '@affine-test/kit/utils/attachment';
import {
  clickEdgelessModeButton,
  clickView,
  locateToolbar,
  toViewCoord,
} from '@affine-test/kit/utils/editor';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  waitForEmptyEditor,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await clickNewPageButton(page);
  await waitForEmptyEditor(page);
});

test.describe('Replaces attachment', () => {
  test('should replace attachment in page', async ({ page }) => {
    const title = getBlockSuiteEditorTitle(page);
    await title.click();
    await page.keyboard.press('Enter');

    await importAttachment(page, 'lorem-ipsum.pdf');

    const attachment = page.locator('affine-attachment').first();
    await attachment.click();

    const name = attachment.locator('.affine-attachment-content-title-text');

    await expect(name).toHaveText('lorem-ipsum.pdf');

    const toolbar = locateToolbar(page);
    const replaceButton = toolbar.getByLabel('Replace attachment');

    await importFile(page, 'v1-color-palettes-snapshot.zip', async () => {
      await replaceButton.click({ delay: 50 });
    });

    await expect(attachment).toBeVisible();

    await expect(name).toHaveText('v1-color-palettes-snapshot.zip');
  });

  test('should replace attachment in edgeless', async ({ page }) => {
    await clickEdgelessModeButton(page);

    const button = page.locator('edgeless-mindmap-tool-button');
    await button.click();

    const menu = page.locator('edgeless-mindmap-menu');
    const mediaItem = menu.locator('.media-item');
    await mediaItem.click();

    await importFile(page, 'lorem-ipsum.pdf', async () => {
      await toViewCoord(page, [100, 250]);
      await clickView(page, [100, 250]);
    });

    const attachment = page.locator('affine-edgeless-attachment').first();
    await attachment.click();

    const name = attachment.locator('.affine-attachment-content-title-text');

    await expect(name).toHaveText('lorem-ipsum.pdf');

    const toolbar = locateToolbar(page);
    const replaceButton = toolbar.getByLabel('Replace attachment');

    await importFile(page, 'v1-color-palettes-snapshot.zip', async () => {
      await replaceButton.click({ delay: 50 });
    });

    await expect(attachment).toBeVisible();

    await expect(name).toHaveText('v1-color-palettes-snapshot.zip');
  });

  test('should fall back to card view when file type does not support embed view', async ({
    page,
  }) => {
    const title = getBlockSuiteEditorTitle(page);
    await title.click();
    await page.keyboard.press('Enter');

    await importAttachment(page, 'lorem-ipsum.pdf');

    const attachment = page.locator('affine-attachment').first();
    await attachment.click();

    const toolbar = locateToolbar(page);

    // Switches to embed view
    await toolbar.getByLabel('Switch view').click();
    await toolbar.getByLabel('Embed view').click();

    const portal = attachment.locator('lit-react-portal');
    await expect(portal).toBeVisible();

    const replaceButton = toolbar.getByLabel('Replace attachment');
    await importFile(page, 'v1-color-palettes-snapshot.zip', async () => {
      await replaceButton.click({ delay: 50 });
    });

    await expect(portal).toBeHidden();

    const name = attachment.locator('.affine-attachment-content-title-text');
    await expect(name).toHaveText('v1-color-palettes-snapshot.zip');
  });
});
