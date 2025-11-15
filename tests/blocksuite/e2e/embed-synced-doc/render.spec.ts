import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import { expect } from '@playwright/test';

import { enterPlaygroundRoom } from '../utils/actions';
import { test } from '../utils/playwright';
import { initEmbedSyncedDocState } from './utils';

test.describe('embed-synced-doc render', () => {
  test.beforeEach(async ({ page }) => {
    await enterPlaygroundRoom(page);
  });

  test('nested embed synced doc should be rendered as card when depth >=1', async ({
    page,
  }) => {
    await initEmbedSyncedDocState(
      page,
      [
        { title: 'Root', content: 'Hello from Root' },
        { title: 'Doc 2', content: 'Hello from Doc 2' },
        { title: 'Doc 3', content: 'Hello from Doc 3' },
      ],
      { chain: true }
    );

    expect(await page.locator('affine-embed-synced-doc-block').count()).toBe(2);
    expect(await page.locator('affine-paragraph').count()).toBe(2);
    expect(await page.locator('affine-embed-synced-doc-card').count()).toBe(1);
    expect(await page.locator('editor-host').count()).toBe(2);
  });

  test('synced doc should be readonly', async ({ page }) => {
    const [_, embedDocId] = await initEmbedSyncedDocState(page, [
      { title: 'Root', content: 'Hello from Root' },
      { title: 'Doc 2', content: 'Hello from Doc 2' },
    ]);

    const locator = page.locator('affine-embed-synced-doc-block');
    await expect(locator).toBeVisible();
    await locator.click();

    const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
    const openMenu = toolbar.getByRole('button', { name: 'Open doc' });
    await openMenu.click();

    const button = toolbar.getByRole('button', { name: 'Open this doc' });
    await button.click();

    await page.evaluate(async embedDocId => {
      const { collection } = window;
      const doc2 = collection.getDoc(embedDocId)!.getStore();
      const [noteBlock] = doc2!.getBlocksByFlavour('affine:note');
      const noteId = noteBlock.id;

      const databaseId = doc2.addBlock(
        'affine:database',
        {
          title: new window.$blocksuite.store.Text('Database 1'),
        },
        noteId
      );
      const model = doc2.getModelById(databaseId) as DatabaseBlockModel;
      const datasource =
        new window.$blocksuite.blocks.database.DatabaseBlockDataSource(model);
      datasource.viewManager.viewAdd('table');
    }, embedDocId);

    // go back to previous doc
    await page.evaluate(() => {
      const { collection, editor } = window;
      editor.doc = collection.getDoc('doc:home')!.getStore();
    });

    const databaseFirstCell = page.locator(
      '.affine-database-column-header.database-row'
    );
    await databaseFirstCell.click({ force: true });
    const selectedCount = await page
      .locator('.affine-embed-synced-doc-container.selected')
      .count();
    expect(selectedCount).toBe(1);
  });
});
