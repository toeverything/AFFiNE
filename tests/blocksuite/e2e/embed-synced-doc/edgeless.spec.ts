import type { AffineReference } from '@blocksuite/affine/inlines/reference';
import type { EmbedSyncedDocBlockProps } from '@blocksuite/affine/model';
import { expect, type Page } from '@playwright/test';

import { clickView } from '../utils/actions/click.js';
import {
  createNote,
  createShapeElement,
  getAllSortedIds,
  getIds,
  getSelectedBound,
  getSelectedIds,
  isIntersected,
  switchEditorMode,
} from '../utils/actions/edgeless';
import { pressBackspace, pressEscape } from '../utils/actions/keyboard.js';
import { enterPlaygroundRoom, waitNextFrame } from '../utils/actions/misc';
import { test } from '../utils/playwright';
import { initEmbedSyncedDocState } from './utils';

test.describe('Embed synced doc in edgeless mode', () => {
  test.beforeEach(async ({ page }) => {
    await enterPlaygroundRoom(page);
  });

  test.fixme('drag embed synced doc to whiteboard should fit in height', async ({
    page,
  }) => {
    await initEmbedSyncedDocState(page, [
      { title: 'Root Doc', content: 'hello root doc' },
      { title: 'Page 1', content: 'hello page 1' },
    ]);

    await switchEditorMode(page);

    // Double click on note to enter edit status
    const noteBlock = page.locator('affine-edgeless-note');
    await noteBlock.dblclick();

    // Drag the embed synced doc to whiteboard
    const embedSyncedBlockInNote = page.locator(
      'affine-embed-synced-doc-block'
    );
    const embedSyncedBoxInNote = await embedSyncedBlockInNote.boundingBox();
    if (!embedSyncedBoxInNote) {
      throw new Error('embedSyncedBoxInNote is not found');
    }
    const height = embedSyncedBoxInNote.height;
    await page.mouse.move(
      embedSyncedBoxInNote.x - 10,
      embedSyncedBoxInNote.y - 100
    );
    await page.mouse.move(
      embedSyncedBoxInNote.x - 10,
      embedSyncedBoxInNote.y + 10
    );
    await waitNextFrame(page);
    await page.mouse.down();
    await page.mouse.move(100, 200, { steps: 30 });
    await page.mouse.up();

    // Check the height of the embed synced doc portal, it should be the same as the embed synced doc in note
    const EmbedSyncedDocBlockInCanvas = page.locator(
      'affine-embed-edgeless-synced-doc-block'
    );
    const EmbedSyncedDocBlockBoxInCanvas =
      await EmbedSyncedDocBlockInCanvas.boundingBox();
    const border = 1;
    if (!EmbedSyncedDocBlockBoxInCanvas) {
      throw new Error('EmbedSyncedDocBlockBoxInCanvas is not found');
    }
    expect(EmbedSyncedDocBlockBoxInCanvas.height).toBeCloseTo(
      height + 2 * border,
      1
    );
  });

  test('new edgeless embed synced doc should fit in height', async ({
    page,
  }) => {
    const [_, embedDocId] = await initEmbedSyncedDocState(page, [
      { title: 'Root Doc', content: 'hello root doc' },
      { title: 'Page 1', content: '1\n2\n3\n4\n5\n6\n7' },
    ]);
    await switchEditorMode(page);

    const paragraphHeight = (
      await page
        .locator('affine-embed-synced-doc-block affine-paragraph')
        .boundingBox()
    )?.height;
    if (!paragraphHeight) {
      test.fail();
      return;
    }

    const createEmbedDocWithHeight = async (height: number) => {
      await page.evaluate(
        ({ embedDocId, height }) => {
          const std = window.editor.std;
          const surface = std.store.getModelsByFlavour('affine:surface')[0];
          std.store.addBlock(
            'affine:embed-synced-doc',
            {
              pageId: embedDocId,
              xywh: `[0,100,370,${height}]`,
            } satisfies Partial<EmbedSyncedDocBlockProps>,
            surface.id
          );
        },
        { embedDocId, height }
      );
      await waitNextFrame(page);
    };

    const embedSyncedBlockInNote = page.locator(
      'affine-embed-edgeless-synced-doc-block'
    );

    {
      const initHeight = paragraphHeight - 50;
      await createEmbedDocWithHeight(initHeight);
      const embedSyncedBoxInNote = await embedSyncedBlockInNote.boundingBox();
      expect(embedSyncedBoxInNote?.height).toBeGreaterThan(initHeight);
    }

    await embedSyncedBlockInNote.click();
    await pressBackspace(page);

    {
      const initHeight = paragraphHeight + 50;
      await createEmbedDocWithHeight(initHeight);
      const embedSyncedBoxInNote = await embedSyncedBlockInNote.boundingBox();
      expect(embedSyncedBoxInNote?.height).toBeLessThan(initHeight);
    }
  });

  test.describe('edgeless element toolbar', () => {
    test.beforeEach(async ({ page }) => {
      await initEmbedSyncedDocState(page, [
        { title: 'Root Doc', content: 'hello root doc' },
        { title: 'Page 1', content: 'hello page 1', inEdgeless: true },
      ]);

      await switchEditorMode(page);

      const edgelessEmbedSyncedBlock = page.locator(
        'affine-embed-edgeless-synced-doc-block'
      );
      await edgelessEmbedSyncedBlock.click();
    });

    const getDocIds = async (page: Page) => {
      return page.evaluate(() => {
        return [...window.collection.docs.keys()];
      });
    };

    const locateToolbar = (page: Page) => {
      return page.locator(
        // TODO(@L-Sun): simplify this selector after that toolbar widget are disabled in preview rendering is ready
        'affine-edgeless-root > .widgets-container affine-toolbar-widget editor-toolbar'
      );
    };

    test('should insert embed-synced-doc into page when click "Insert into page" button', async ({
      page,
    }) => {
      const embedSyncedBlock = page.locator('affine-embed-synced-doc-block');
      const edgelessEmbedSyncedBlock = page.locator(
        'affine-embed-edgeless-synced-doc-block'
      );

      const toolbar = locateToolbar(page);
      const insertButton = toolbar.getByLabel('Insert to page');
      await insertButton.click();

      await expect(
        edgelessEmbedSyncedBlock,
        'the edgeless embed synced doc should be remained after click insert button'
      ).toBeVisible();

      await switchEditorMode(page);
      await expect(embedSyncedBlock).toBeVisible();
    });

    test('should render a reference node and all content of embed-synced-doc after click "Duplicate as note" button', async ({
      page,
    }) => {
      // switch doc
      const switchDoc = async () =>
        page.evaluate(() => {
          for (const [id, doc] of window.collection.docs.entries()) {
            if (id !== window.doc.id) {
              window.editor.doc = doc.getStore();
              window.doc = window.editor.doc;
              break;
            }
          }
        });
      await switchDoc();

      const toolbar = locateToolbar(page);

      await createNote(page, [0, 100, 100, 800], 'hello note');
      await pressEscape(page, 3);
      await clickView(page, [400, 150]);
      await toolbar.getByLabel('Display in Page').click();

      await switchDoc();

      const edgelessEmbedSyncedBlock = page.locator(
        'affine-embed-edgeless-synced-doc-block'
      );
      await edgelessEmbedSyncedBlock.click();
      await toolbar.getByLabel('Duplicate as note').click();

      const edgelessNotes = page.locator('affine-edgeless-note');
      await expect(edgelessNotes).toHaveCount(2);
      await expect(edgelessNotes.last()).toBeVisible();

      const blocks = edgelessNotes.last().locator('[data-block-id]');
      await expect(blocks).toHaveCount(3);
      const reference = blocks.nth(0).locator('affine-reference');
      const paragraph1 = blocks.nth(1).locator('[data-v-text="true"]');
      const paragraph2 = blocks.nth(2).locator('[data-v-text="true"]');
      const refInfo = await reference.evaluate((reference: AffineReference) => {
        return reference.delta.attributes?.reference;
      });

      expect(refInfo).toEqual({
        type: 'LinkedPage',
        pageId: (await getDocIds(page))[1],
      });
      await expect(paragraph1).toHaveText('hello page 1');
      await expect(paragraph2).toHaveText('hello note');
    });

    test('should be selected and not overlay with the embed-synced-doc after duplicating as note', async ({
      page,
    }) => {
      const prevIds = await getIds(page);

      const embedDocBound = await getSelectedBound(page);

      const toolbar = locateToolbar(page);
      await toolbar.getByLabel('Duplicate as note').click();

      const edgelessNotes = page.locator('affine-edgeless-note');
      await expect(edgelessNotes).toHaveCount(2);
      expect(await getSelectedIds(page)).toHaveLength(1);
      expect(await getSelectedIds(page)).not.toContain(prevIds);
      await expect(edgelessNotes.last()).toBeVisible();

      const noteBound = await getSelectedBound(page);
      expect(isIntersected(embedDocBound, noteBound)).toBe(false);
    });

    test('edgeless note duplicated from embed-synced-doc should be above other elements', async ({
      page,
    }) => {
      await createShapeElement(page, [0, 0], [100, 100]);
      await page.locator('affine-embed-edgeless-synced-doc-block').click();
      const toolbar = locateToolbar(page);
      await toolbar.getByLabel('Duplicate as note').click();

      const edgelessNotes = page.locator('affine-edgeless-note');
      await expect(edgelessNotes).toHaveCount(2);
      const duplicatedNoteId = (await getSelectedIds(page))[0];
      const sortedIds = await getAllSortedIds(page);
      //
      expect(sortedIds[sortedIds.length - 1]).toBe(duplicatedNoteId);
    });
  });
});
