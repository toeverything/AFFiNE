import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import { expect, type Page } from '@playwright/test';

import { switchEditorMode } from './utils/actions/edgeless.js';
import { getLinkedDocPopover } from './utils/actions/linked-doc.js';
import {
  enterPlaygroundRoom,
  focusRichText,
  initEmptyEdgelessState,
  initEmptyParagraphState,
  waitNextFrame,
} from './utils/actions/misc.js';
import { test } from './utils/playwright.js';

test.describe('Embed synced doc', () => {
  test.beforeEach(async ({ page }) => {
    await enterPlaygroundRoom(page);
  });

  async function createAndConvertToEmbedSyncedDoc(page: Page) {
    const { createLinkedDoc } = getLinkedDocPopover(page);
    const linkedDoc = await createLinkedDoc('page1');
    const lickedDocBox = await linkedDoc.boundingBox();
    if (!lickedDocBox) {
      throw new Error('lickedDocBox is not found');
    }
    await page.mouse.move(
      lickedDocBox.x + lickedDocBox.width / 2,
      lickedDocBox.y + lickedDocBox.height / 2
    );

    await waitNextFrame(page, 200);
    const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
    await expect(toolbar).toBeVisible();

    const switchButton = toolbar.getByRole('button', { name: 'Switch view' });
    await switchButton.click();

    const embedSyncedDocBtn = toolbar.getByRole('button', {
      name: 'Embed view',
    });
    await expect(embedSyncedDocBtn).toBeVisible();

    await embedSyncedDocBtn.click();
    await waitNextFrame(page, 200);

    const embedSyncedBlock = page.locator('affine-embed-synced-doc-block');
    expect(await embedSyncedBlock.count()).toBe(1);
  }

  test('can change linked doc to embed synced doc', async ({ page }) => {
    await initEmptyParagraphState(page);
    await focusRichText(page);

    await createAndConvertToEmbedSyncedDoc(page);
  });

  test('can change embed synced doc to card view', async ({ page }) => {
    await initEmptyParagraphState(page);
    await focusRichText(page);

    await createAndConvertToEmbedSyncedDoc(page);

    const syncedDoc = page.locator(`affine-embed-synced-doc-block`);
    const syncedDocBox = await syncedDoc.boundingBox();
    if (!syncedDocBox) {
      throw new Error('syncedDocBox is not found');
    }
    await page.mouse.click(
      syncedDocBox.x + syncedDocBox.width / 2,
      syncedDocBox.y + syncedDocBox.height / 2
    );

    await waitNextFrame(page, 200);
    const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
    await expect(toolbar).toBeVisible();

    const switchBtn = toolbar.getByRole('button', { name: 'Switch view' });
    await expect(switchBtn).toBeVisible();

    await switchBtn.click();
    await waitNextFrame(page, 200);

    const cardBtn = toolbar.getByRole('button', { name: 'Card view' });
    await cardBtn.click();
    await waitNextFrame(page, 200);

    const embedSyncedBlock = page.locator('affine-embed-linked-doc-block');
    expect(await embedSyncedBlock.count()).toBe(1);
  });

  test.fixme(
    'drag embed synced doc to whiteboard should fit in height',
    async ({ page }) => {
      await initEmptyEdgelessState(page);
      await focusRichText(page);

      await createAndConvertToEmbedSyncedDoc(page);

      // Focus on the embed synced doc
      const embedSyncedBlock = page.locator('affine-embed-synced-doc-block');
      let embedSyncedBox = await embedSyncedBlock.boundingBox();
      if (!embedSyncedBox) {
        throw new Error('embedSyncedBox is not found');
      }
      await page.mouse.click(
        embedSyncedBox.x + embedSyncedBox.width / 2,
        embedSyncedBox.y + embedSyncedBox.height / 2
      );

      // Switch to edgeless mode
      await switchEditorMode(page);
      await waitNextFrame(page, 200);

      // Double click on note to enter edit status
      const noteBlock = page.locator('affine-edgeless-note');
      const noteBlockBox = await noteBlock.boundingBox();
      if (!noteBlockBox) {
        throw new Error('noteBlockBox is not found');
      }
      await page.mouse.dblclick(noteBlockBox.x + 10, noteBlockBox.y + 10);
      await waitNextFrame(page, 200);

      // Drag the embed synced doc to whiteboard
      embedSyncedBox = await embedSyncedBlock.boundingBox();
      if (!embedSyncedBox) {
        throw new Error('embedSyncedBox is not found');
      }
      const height = embedSyncedBox.height;
      await page.mouse.move(embedSyncedBox.x - 10, embedSyncedBox.y - 100);
      await page.mouse.move(embedSyncedBox.x - 10, embedSyncedBox.y + 10);
      await waitNextFrame(page);
      await page.mouse.down();
      await page.mouse.move(100, 200, { steps: 30 });
      await page.mouse.up();

      // Check the height of the embed synced doc portal, it should be the same as the embed synced doc in note
      const EmbedSyncedDocBlock = page.locator(
        'affine-embed-edgeless-synced-doc-block'
      );
      const EmbedSyncedDocBlockBox = await EmbedSyncedDocBlock.boundingBox();
      const border = 1;
      if (!EmbedSyncedDocBlockBox) {
        throw new Error('EmbedSyncedDocBlockBox is not found');
      }
      expect(EmbedSyncedDocBlockBox.height).toBeCloseTo(height + 2 * border, 1);
    }
  );

  test('nested embed synced doc should be rendered as card when depth >=1', async ({
    page,
  }) => {
    await page.evaluate(() => {
      const { doc, collection } = window;
      const rootId = doc.addBlock('affine:page', {
        title: new window.$blocksuite.store.Text(),
      });

      const noteId = doc.addBlock('affine:note', {}, rootId);
      doc.addBlock('affine:paragraph', {}, noteId);

      const doc2 = collection.createDoc('doc2').getStore();
      doc2.load();
      const rootId2 = doc2.addBlock('affine:page', {
        title: new window.$blocksuite.store.Text('Doc 2'),
      });

      const noteId2 = doc2.addBlock('affine:note', {}, rootId2);
      doc2.addBlock(
        'affine:paragraph',
        {
          text: new window.$blocksuite.store.Text('Hello from Doc 2'),
        },
        noteId2
      );

      const doc3 = collection.createDoc('doc3').getStore();
      doc3.load();
      const rootId3 = doc3.addBlock('affine:page', {
        title: new window.$blocksuite.store.Text('Doc 3'),
      });

      const noteId3 = doc3.addBlock('affine:note', {}, rootId3);
      doc3.addBlock(
        'affine:paragraph',
        {
          text: new window.$blocksuite.store.Text('Hello from Doc 3'),
        },
        noteId3
      );

      doc2.addBlock(
        'affine:embed-synced-doc',
        {
          pageId: 'doc3',
        },
        noteId2
      );
      doc.addBlock(
        'affine:embed-synced-doc',
        {
          pageId: 'doc2',
        },
        noteId
      );
    });
    expect(await page.locator('affine-embed-synced-doc-block').count()).toBe(2);
    expect(await page.locator('affine-paragraph').count()).toBe(2);
    expect(await page.locator('affine-embed-synced-doc-card').count()).toBe(1);
    expect(await page.locator('editor-host').count()).toBe(2);
  });

  test.describe('synced doc should be readonly', () => {
    test('synced doc should be readonly', async ({ page }) => {
      await initEmptyParagraphState(page);
      await focusRichText(page);
      await createAndConvertToEmbedSyncedDoc(page);

      const locator = page.locator('affine-embed-synced-doc-block');
      await expect(locator).toBeVisible();
      await locator.click();

      const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
      const openMenu = toolbar.getByRole('button', { name: 'Open doc' });
      await openMenu.click();

      const button = toolbar.getByRole('button', { name: 'Open this doc' });
      await button.click();

      await page.evaluate(async () => {
        const { collection } = window;
        const getDocCollection = () => {
          for (const [id, doc] of collection.docs.entries()) {
            if (id === 'doc:home') {
              continue;
            }
            return doc;
          }
          return null;
        };

        const doc2Collection = getDocCollection();
        const doc2 = doc2Collection!.getStore();
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
      });

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
});
