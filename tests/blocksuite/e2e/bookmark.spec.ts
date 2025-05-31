import './utils/declare-test-window.js';

import type { BookmarkBlockComponent } from '@blocksuite/affine/blocks/bookmark';
import type { BlockSnapshot } from '@blocksuite/store';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import {
  activeNoteInEdgeless,
  clickView,
  copyByKeyboard,
  createNote,
  dragBlockToPoint,
  edgelessCommonSetup,
  enterPlaygroundRoom,
  expectConsoleMessage,
  focusRichText,
  getPageSnapshot,
  initEmptyEdgelessState,
  initEmptyParagraphState,
  pasteByKeyboard,
  pasteContent,
  pressArrowDown,
  pressArrowRight,
  pressArrowUp,
  pressBackspace,
  pressEnter,
  pressShiftTab,
  pressTab,
  selectAllByKeyboard,
  setInlineRangeInSelectedRichText,
  SHORT_KEY,
  switchEditorMode,
  type,
  waitForInlineEditorStateUpdated,
  waitNextFrame,
} from './utils/actions/index.js';
import {
  assertAlmostEqual,
  assertBlockChildrenIds,
  assertBlockCount,
  assertBlockFlavour,
  assertBlockSelections,
  assertParentBlockFlavour,
  assertRichTextInlineRange,
} from './utils/asserts.js';
import { ignoreSnapshotId } from './utils/ignore.js';
import { scoped, test } from './utils/playwright.js';
import { getEmbedCardToolbar } from './utils/query.js';

const LOCAL_HOST_URL = 'http://localhost';

const YOUTUBE_URL = 'https://www.youtube.com/watch?v=fakeid';

const FIGMA_URL = 'https://www.figma.com/design/JuXs6uOAICwf4I4tps0xKZ123';

test.beforeEach(async ({ page }) => {
  await page.route(
    'https://affine-worker.toeverything.workers.dev/api/worker/link-preview',
    async route => {
      await route.fulfill({
        json: {},
      });
    }
  );
});

const createBookmarkBlockBySlashMenu = async (
  page: Page,
  url = LOCAL_HOST_URL
) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await page.waitForTimeout(100);
  await type(page, '/link', 100);
  await pressEnter(page);
  await page.waitForTimeout(100);
  await type(page, url);
  await pressEnter(page);
};

test(scoped`create bookmark by slash menu`, async ({ page }, testInfo) => {
  await createBookmarkBlockBySlashMenu(page);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_final.json`
  );
});

test(scoped`covert bookmark block to link text`, async ({ page }, testInfo) => {
  await createBookmarkBlockBySlashMenu(page);
  const bookmark = page.locator('affine-bookmark');
  await bookmark.click();
  await page.waitForTimeout(100);
  await page.getByRole('button', { name: 'Switch view' }).click();
  await page.getByRole('button', { name: 'Inline view' }).click();
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_final.json`
  );
});

test(
  scoped`copy url to create bookmark in page mode`,
  async ({ page }, testInfo) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);

    await type(page, LOCAL_HOST_URL);
    await setInlineRangeInSelectedRichText(page, 0, LOCAL_HOST_URL.length);
    await copyByKeyboard(page);
    await focusRichText(page);
    await type(page, '/link');
    await pressEnter(page);
    await page.keyboard.press(`${SHORT_KEY}+v`);
    await pressEnter(page);
    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_final.json`
    );
  }
);

test(
  scoped`copy url to create bookmark in edgeless mode`,
  async ({ page }, testInfo) => {
    await enterPlaygroundRoom(page);
    const ids = await initEmptyEdgelessState(page);
    await focusRichText(page);
    await type(page, LOCAL_HOST_URL);

    await switchEditorMode(page);

    await activeNoteInEdgeless(page, ids.noteId);
    await waitForInlineEditorStateUpdated(page);
    await focusRichText(page);
    await selectAllByKeyboard(page);
    await copyByKeyboard(page);
    await pressArrowRight(page);
    await waitNextFrame(page);
    await type(page, '/link', 100);
    await pressEnter(page);
    await page.waitForTimeout(100);
    await waitNextFrame(page);
    await page.keyboard.press(`${SHORT_KEY}+v`);
    await pressEnter(page);
    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_final.json`
    );
  }
);

test.fixme(
  scoped`support dragging bookmark block directly`,
  async ({ page }, testInfo) => {
    await createBookmarkBlockBySlashMenu(page);
    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_init.json`
    );

    const bookmark = page.locator('affine-bookmark');
    const rect = await bookmark.boundingBox();
    if (!rect) {
      throw new Error('image not found');
    }

    // add new paragraph blocks
    await page.mouse.click(rect.x + 20, rect.y + rect.height + 20);
    await focusRichText(page);
    await type(page, '111');
    await page.waitForTimeout(200);
    await pressEnter(page);

    await type(page, '222');
    await page.waitForTimeout(200);
    await pressEnter(page);

    await type(page, '333');
    await page.waitForTimeout(200);

    await page.waitForTimeout(200);
    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_after_add_paragraph.json`
    );

    // drag bookmark block
    await page.mouse.move(rect.x + 20, rect.y + 20);
    await page.mouse.down();
    await page.waitForTimeout(200);

    await page.mouse.move(rect.x + 40, rect.y + rect.height + 80, {
      steps: 5,
    });
    await page.waitForTimeout(200);

    await page.mouse.up();
    await page.waitForTimeout(200);

    const rects = page
      .locator('affine-block-selection')
      .locator('visible=true');
    await expect(rects).toHaveCount(1);

    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_after_drag.json`
    );
  }
);

test('press backspace after bookmark block can select bookmark block', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await pressEnter(page);
  await pressArrowUp(page);
  await type(page, '/link');
  await pressEnter(page);
  await page.waitForTimeout(100);
  await type(page, LOCAL_HOST_URL);
  await pressEnter(page);

  await focusRichText(page);
  await assertBlockCount(page, 'paragraph', 1);
  await assertRichTextInlineRange(page, 0, 0);
  await pressBackspace(page);
  await assertBlockSelections(page, ['4']);
  await assertBlockCount(page, 'paragraph', 0);
});

test.describe('embed card toolbar', () => {
  async function showEmbedCardToolbar(page: Page) {
    await createBookmarkBlockBySlashMenu(page);
    const bookmark = page.locator('affine-bookmark');
    await bookmark.click();
    await page.waitForTimeout(100);
    const { embedCardToolbar } = getEmbedCardToolbar(page);
    await expect(embedCardToolbar).toBeVisible();
  }

  test('show toolbar when bookmark selected', async ({ page }) => {
    await showEmbedCardToolbar(page);
  });

  // TODO(@fundon): should move to affine side
  test.skip('copy bookmark url by copy button', async ({ page }, testInfo) => {
    await showEmbedCardToolbar(page);
    const { copyButton } = getEmbedCardToolbar(page);
    await copyButton.click();
    await page.mouse.click(600, 600);
    await waitNextFrame(page);

    await pasteByKeyboard(page);
    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_final.json`
    );
  });

  test('change card style', async ({ page }) => {
    await showEmbedCardToolbar(page);
    const bookmark = page.locator('affine-bookmark');
    const { openCardStyleMenu } = getEmbedCardToolbar(page);
    await openCardStyleMenu();
    const { cardStyleHorizontalButton, cardStyleListButton } =
      getEmbedCardToolbar(page);
    await cardStyleListButton.click();
    await waitNextFrame(page);
    const listStyleBookmarkBox = await bookmark.boundingBox();
    if (!listStyleBookmarkBox) {
      throw new Error('listStyleBookmarkBox is not found');
    }
    assertAlmostEqual(listStyleBookmarkBox.width, 752, 2);
    assertAlmostEqual(listStyleBookmarkBox.height, 48, 2);

    await openCardStyleMenu();
    await cardStyleHorizontalButton.click();
    await waitNextFrame(page);
    const horizontalStyleBookmarkBox = await bookmark.boundingBox();
    if (!horizontalStyleBookmarkBox) {
      throw new Error('horizontalStyleBookmarkBox is not found');
    }
    assertAlmostEqual(horizontalStyleBookmarkBox.width, 752, 2);
    assertAlmostEqual(horizontalStyleBookmarkBox.height, 116, 2);
  });
});

test('indent bookmark block to paragraph', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page);
  await pressEnter(page);
  await type(page, '/link', 100);
  await pressEnter(page);
  await type(page, LOCAL_HOST_URL);
  await pressEnter(page);

  await assertBlockChildrenIds(page, '1', ['2', '4']);
  await assertBlockFlavour(page, '1', 'affine:note');
  await assertBlockFlavour(page, '2', 'affine:paragraph');
  await assertBlockFlavour(page, '4', 'affine:bookmark');

  await focusRichText(page);
  await pressArrowDown(page);
  await assertBlockSelections(page, ['4']);
  await pressTab(page);
  await assertBlockChildrenIds(page, '1', ['2']);
  await assertBlockChildrenIds(page, '2', ['4']);

  await pressShiftTab(page);
  await assertBlockChildrenIds(page, '1', ['2', '4']);
});

test('indent bookmark block to list', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page);
  await type(page, '- a');
  await pressEnter(page);
  await type(page, '/link', 100);
  await pressEnter(page);
  await type(page, LOCAL_HOST_URL);
  await pressEnter(page);

  await assertBlockChildrenIds(page, '1', ['3', '5']);
  await assertBlockFlavour(page, '1', 'affine:note');
  await assertBlockFlavour(page, '3', 'affine:list');
  await assertBlockFlavour(page, '5', 'affine:bookmark');

  await focusRichText(page);
  await pressArrowDown(page);
  await assertBlockSelections(page, ['5']);
  await pressTab(page);
  await assertBlockChildrenIds(page, '1', ['3']);
  await assertBlockChildrenIds(page, '3', ['5']);

  await pressShiftTab(page);
  await assertBlockChildrenIds(page, '1', ['3', '5']);
});

test('bookmark can be dragged from note to surface top level block', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await focusRichText(page);
  await page.waitForTimeout(100);
  await type(page, '/link', 100);
  await pressEnter(page);
  await page.waitForTimeout(100);
  await type(page, LOCAL_HOST_URL);
  await pressEnter(page);

  await switchEditorMode(page);
  await page.mouse.dblclick(450, 450);

  await dragBlockToPoint(page, '4', { x: 200, y: 200 });

  await waitNextFrame(page);
  await assertParentBlockFlavour(page, '4', 'affine:surface');
});

test('bookmark card should show banner in edgeless mode', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  const url = 'https://github.com/toeverything/AFFiNE/pull/11796';

  await page.locator('edgeless-link-tool-button').click();
  await page.locator('.embed-card-modal-input').fill(url);
  await pressEnter(page);

  const banner = page.locator('.affine-bookmark-banner');
  await expect(banner).toBeVisible();
});

test.describe('embed youtube card', () => {
  test(scoped`create youtube card by slash menu`, async ({ page }) => {
    expectConsoleMessage(page, /Unrecognized feature/, 'warning');
    expectConsoleMessage(page, /Failed to load resource/);
    await createBookmarkBlockBySlashMenu(page, YOUTUBE_URL);
    const snapshot = (await getPageSnapshot(page)) as BlockSnapshot;
    expect(ignoreSnapshotId(snapshot)).toMatchSnapshot('embed-youtube.json');
  });

  test(scoped`change youtube card style`, async ({ page }) => {
    expectConsoleMessage(page, /Unrecognized feature/, 'warning');
    expectConsoleMessage(page, /Failed to load resource/);

    await createBookmarkBlockBySlashMenu(page, YOUTUBE_URL);
    const youtube = page.locator('affine-embed-youtube-block');
    await youtube.click();
    await page.waitForTimeout(100);

    // change to card view
    const embedToolbar = page.locator('affine-toolbar-widget editor-toolbar');
    await expect(embedToolbar).toBeVisible();
    const embedView = page.locator('editor-menu-button', {
      hasText: 'embed view',
    });
    await expect(embedView).toBeVisible();
    await embedView.click();
    const cardView = page.locator('editor-menu-action', {
      hasText: 'card view',
    });
    await expect(cardView).toBeVisible();
    await cardView.click();
    const snapshot = (await getPageSnapshot(page)) as BlockSnapshot;
    expect(ignoreSnapshotId(snapshot)).toMatchSnapshot(
      'horizontal-youtube.json'
    );

    // change to embed view
    const bookmark = page.locator('affine-bookmark');
    await bookmark.click();
    await page.waitForTimeout(100);
    const cardView2 = page.locator('editor-icon-button', {
      hasText: 'card view',
    });
    await expect(cardView2).toBeVisible();
    await cardView2.click();
    const embedView2 = page.locator('editor-menu-action', {
      hasText: 'embed view',
    });
    await expect(embedView2).toBeVisible();
    await embedView2.click();
    const snapshot2 = (await getPageSnapshot(page)) as BlockSnapshot;
    expect(ignoreSnapshotId(snapshot2)).toMatchSnapshot('embed-youtube.json');
  });
});

test.describe('embed figma card', () => {
  test(scoped`create figma card by slash menu`, async ({ page }) => {
    expectConsoleMessage(page, /Failed to load resource/);
    expectConsoleMessage(page, /Refused to frame/);
    await createBookmarkBlockBySlashMenu(page, FIGMA_URL);
    const snapshot = (await getPageSnapshot(page)) as BlockSnapshot;
    expect(ignoreSnapshotId(snapshot)).toMatchSnapshot('embed-figma.json');
  });

  test(scoped`change figma card style`, async ({ page }) => {
    expectConsoleMessage(page, /Failed to load resource/);
    expectConsoleMessage(page, /Refused to frame/);
    expectConsoleMessage(page, /Running frontend commit/, 'log');
    await createBookmarkBlockBySlashMenu(page, FIGMA_URL);
    const youtube = page.locator('affine-embed-figma-block');
    await youtube.click();
    await page.waitForTimeout(100);

    // change to card view
    const embedToolbar = page.locator('affine-toolbar-widget editor-toolbar');
    await expect(embedToolbar).toBeVisible();
    const embedView = page.locator('editor-menu-button', {
      hasText: 'embed view',
    });
    await expect(embedView).toBeVisible();
    await embedView.click();
    const cardView = page.locator('editor-menu-action', {
      hasText: 'card view',
    });
    await expect(cardView).toBeVisible();
    await cardView.click();
    const snapshot = (await getPageSnapshot(page)) as BlockSnapshot;
    expect(ignoreSnapshotId(snapshot)).toMatchSnapshot('horizontal-figma.json');

    // change to embed view
    const bookmark = page.locator('affine-bookmark');
    await bookmark.click();
    await page.waitForTimeout(100);
    const cardView2 = page.locator('editor-icon-button', {
      hasText: 'card view',
    });
    await expect(cardView2).toBeVisible();
    await cardView2.click();
    const embedView2 = page.locator('editor-menu-action', {
      hasText: 'embed view',
    });
    await expect(embedView2).toBeVisible();
    await embedView2.click();
    const snapshot2 = (await getPageSnapshot(page)) as BlockSnapshot;
    expect(ignoreSnapshotId(snapshot2)).toMatchSnapshot('embed-figma.json');
  });
});

test.describe('embed github card', () => {
  test('github embed card should show banner in edgeless mode', async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initEmptyEdgelessState(page);
    await switchEditorMode(page);
    await clickView(page, [0, 0]);
    const url = 'https://github.com/toeverything/AFFiNE/pull/11796';

    await pasteContent(page, {
      'text/plain': url,
    });

    const banner = page.locator('.affine-embed-github-banner');
    await expect(banner).toBeVisible();
  });
});

test('drag a card from canvas to note should not change the style of the card', async ({
  page,
}) => {
  const url = 'https://github.com/toeverything/AFFiNE/pull/12660';

  await edgelessCommonSetup(page);
  await createNote(page, [-100, -300]);
  await page.locator('edgeless-link-tool-button').click();
  await page.locator('.embed-card-modal-input').fill(url);
  await pressEnter(page);

  const edgelessBookmark = page.locator('affine-edgeless-bookmark');
  await edgelessBookmark.click();
  await waitNextFrame(page);
  const dragHandle = page.locator('.affine-drag-handle-container');
  await dragHandle.dragTo(page.locator('affine-edgeless-note'));

  const noteBookmark = page.locator('affine-bookmark');
  await expect(noteBookmark).toBeVisible();
  const style = await noteBookmark.evaluate(
    (el: BookmarkBlockComponent) => el.model.props.style
  );
  expect(style).toBe('horizontal');
});
