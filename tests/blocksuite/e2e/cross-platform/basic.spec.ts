import type { DeltaInsert } from '@blocksuite/store';
import { expect } from '@playwright/test';

import {
  addNoteByClick,
  captureHistory,
  click,
  disconnectByClick,
  enterPlaygroundRoom,
  focusRichText,
  focusTitle,
  getCurrentEditorTheme,
  getCurrentHTMLTheme,
  getPageSnapshot,
  initEmptyEdgelessState,
  initEmptyParagraphState,
  pressArrowLeft,
  pressArrowRight,
  pressBackspace,
  pressEnter,
  pressForwardDelete,
  pressForwardDeleteWord,
  pressShiftEnter,
  redoByClick,
  redoByKeyboard,
  setSelection,
  switchEditorMode,
  toggleDarkMode,
  type,
  undoByClick,
  undoByKeyboard,
  waitDefaultPageLoaded,
  waitNextFrame,
} from '../utils/actions/index.js';
import {
  assertBlockChildrenIds,
  assertEmpty,
  assertRichTextInlineDeltas,
  assertRichTexts,
  assertText,
  assertTitle,
} from '../utils/asserts.js';
import { scoped, test } from '../utils/playwright.js';
import { getFormatBar } from '../utils/query.js';

const BASIC_DEFAULT_SNAPSHOT = 'basic test default';

test(scoped`basic input`, async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'hello');

  await test.expect(page).toHaveTitle(/BlockSuite/);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${BASIC_DEFAULT_SNAPSHOT}.json`
  );
  await assertText(page, 'hello');
});

test(scoped`basic init with external text`, async ({ page }) => {
  await enterPlaygroundRoom(page);

  await page.evaluate(() => {
    const { doc } = window;
    const rootId = doc.addBlock('affine:page', {
      title: new window.$blocksuite.store.Text('hello'),
    });
    const note = doc.addBlock('affine:note', {}, rootId);

    const text = new window.$blocksuite.store.Text('world');
    doc.addBlock('affine:paragraph', { text }, note);

    const delta = [
      { insert: 'foo ' },
      { insert: 'bar', attributes: { bold: true } },
    ];
    doc.addBlock(
      'affine:paragraph',
      {
        text: new window.$blocksuite.store.Text(delta as DeltaInsert[]),
      },
      note
    );
  });

  await assertTitle(page, 'hello');
  await assertRichTexts(page, ['world', 'foo bar']);
  await focusRichText(page);
});

test(scoped`basic multi user state`, async ({ context, page: pageA }) => {
  const room = await enterPlaygroundRoom(pageA);
  await initEmptyParagraphState(pageA);
  await waitNextFrame(pageA);
  await waitDefaultPageLoaded(pageA);
  await focusTitle(pageA);
  await type(pageA, 'hello');

  const pageB = await context.newPage();
  await enterPlaygroundRoom(pageB, {
    room,
    noInit: true,
  });
  await waitDefaultPageLoaded(pageB);
  await focusTitle(pageB);
  await assertTitle(pageB, 'hello');

  await type(pageB, ' world');
  await assertTitle(pageA, 'hello world');
});

test(
  scoped`A open and edit, then joins B`,
  async ({ context, page: pageA }) => {
    const room = await enterPlaygroundRoom(pageA);
    await initEmptyParagraphState(pageA);
    await waitNextFrame(pageA);
    await focusRichText(pageA);
    await type(pageA, 'hello');

    const pageB = await context.newPage();
    await enterPlaygroundRoom(pageB, {
      room,
      noInit: true,
    });

    // wait until pageB content updated
    await assertText(pageB, 'hello');
    await Promise.all([
      assertText(pageA, 'hello'),
      expect(await getPageSnapshot(pageA, true)).toMatchSnapshot(
        `${BASIC_DEFAULT_SNAPSHOT}.json`
      ),
      expect(await getPageSnapshot(pageB, true)).toMatchSnapshot(
        `${BASIC_DEFAULT_SNAPSHOT}.json`
      ),
      assertBlockChildrenIds(pageA, '0', ['1']),
      assertBlockChildrenIds(pageB, '0', ['1']),
    ]);
  }
);

test(scoped`A first open, B first edit`, async ({ context, page: pageA }) => {
  const room = await enterPlaygroundRoom(pageA);
  await initEmptyParagraphState(pageA);
  await waitNextFrame(pageA);
  await focusRichText(pageA);

  const pageB = await context.newPage();
  await enterPlaygroundRoom(pageB, {
    room,
    noInit: true,
  });
  await pageB.waitForTimeout(500);
  await focusRichText(pageB);

  await waitNextFrame(pageA);
  await waitNextFrame(pageB);
  await type(pageB, 'hello');
  await pageA.waitForTimeout(500);

  // wait until pageA content updated
  await assertText(pageA, 'hello');
  await assertText(pageB, 'hello');
  await Promise.all([
    expect(await getPageSnapshot(pageA, true)).toMatchSnapshot(
      `${BASIC_DEFAULT_SNAPSHOT}.json`
    ),
    expect(await getPageSnapshot(pageB, true)).toMatchSnapshot(
      `${BASIC_DEFAULT_SNAPSHOT}.json`
    ),
  ]);
});

test(
  scoped`does not sync when disconnected`,
  async ({ browser, page: pageA }) => {
    test.fail();

    const room = await enterPlaygroundRoom(pageA);
    const pageB = await browser.newPage();
    await enterPlaygroundRoom(pageB, { room });

    await disconnectByClick(pageA);
    await disconnectByClick(pageB);

    // click together, both init with default id should lead to conflicts
    await initEmptyParagraphState(pageA);
    await initEmptyParagraphState(pageB);

    await waitNextFrame(pageA);
    await focusRichText(pageA);
    await waitNextFrame(pageB);
    await focusRichText(pageB);
    await waitNextFrame(pageA);

    await type(pageA, '');
    await waitNextFrame(pageB);
    await type(pageB, '');
    await waitNextFrame(pageA);
    await type(pageA, 'hello');
    await waitNextFrame(pageB);

    await assertText(pageB, 'hello');
    await assertText(pageA, 'hello'); // actually '\n'
  }
);

test(scoped`basic paired undo/redo`, async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'hello');

  await assertText(page, 'hello');
  await undoByClick(page);
  await assertEmpty(page);
  await redoByClick(page);
  await assertText(page, 'hello');

  await undoByClick(page);
  await assertEmpty(page);
  await redoByClick(page);
  await assertText(page, 'hello');
});

test(scoped`undo/redo with keyboard`, async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'hello');

  await assertText(page, 'hello');
  await undoByKeyboard(page);
  await assertEmpty(page);
  await redoByClick(page);
  await assertText(page, 'hello');
});

test(scoped`undo after adding block twice`, async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page);
  await type(page, 'hello');
  await pressEnter(page);
  await type(page, 'world');

  await undoByKeyboard(page);
  await assertRichTexts(page, ['hello']);
  await redoByKeyboard(page);
  await assertRichTexts(page, ['hello', 'world']);
});

test(scoped`undo/redo twice after adding block twice`, async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'hello');
  await pressEnter(page);
  await type(page, 'world');
  await assertRichTexts(page, ['hello', 'world']);

  await undoByKeyboard(page);
  await assertRichTexts(page, ['hello']);

  await undoByKeyboard(page);
  await assertRichTexts(page, ['']);

  await redoByClick(page);
  await assertRichTexts(page, ['hello']);

  await redoByKeyboard(page);
  await assertRichTexts(page, ['hello', 'world']);
});

test(scoped`should undo/redo works on title`, async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await waitNextFrame(page);
  await focusTitle(page);
  await type(page, 'title');
  await focusRichText(page);
  await type(page, 'hello world');

  await assertTitle(page, 'title');
  await assertRichTexts(page, ['hello world']);

  await captureHistory(page);
  await pressBackspace(page, 5);
  await captureHistory(page);
  await focusTitle(page);
  await type(page, ' something');

  await assertTitle(page, 'title something');
  await assertRichTexts(page, ['hello ']);

  await focusRichText(page);
  await undoByKeyboard(page);
  await assertTitle(page, 'title');
  await assertRichTexts(page, ['hello ']);
  await undoByKeyboard(page);
  await assertTitle(page, 'title');
  await assertRichTexts(page, ['hello world']);

  await redoByKeyboard(page);
  await assertTitle(page, 'title');
  await assertRichTexts(page, ['hello ']);
  await redoByKeyboard(page);
  await assertTitle(page, 'title something');
  await assertRichTexts(page, ['hello ']);
});

test(scoped`undo multi notes`, async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await addNoteByClick(page);
  await assertRichTexts(page, ['', '']);

  await undoByClick(page);
  await assertRichTexts(page, ['']);

  await redoByClick(page);
  await assertRichTexts(page, ['', '']);
});

test(scoped`change theme`, async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  const currentTheme = await getCurrentHTMLTheme(page);
  await toggleDarkMode(page);
  const expectNextTheme = currentTheme === 'light' ? 'dark' : 'light';
  const nextHTMLTheme = await getCurrentHTMLTheme(page);
  expect(nextHTMLTheme).toBe(expectNextTheme);

  const nextEditorTheme = await getCurrentEditorTheme(page);
  expect(nextEditorTheme).toBe(expectNextTheme);
});

test(
  scoped`should be able to delete an emoji completely by pressing backspace once`,
  async ({ page }) => {
    test.info().annotations.push({
      type: 'issue',
      description: 'https://github.com/toeverything/blocksuite/issues/2138',
    });
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);
    await type(page, '🌷🙅‍♂️🏳️‍🌈');
    await pressBackspace(page);
    await pressBackspace(page);
    await pressBackspace(page);
    await assertText(page, '');
  }
);

test(scoped`delete emoji in the middle of the text`, async ({ page }) => {
  test.info().annotations.push({
    type: 'issue',
    description: 'https://github.com/toeverything/blocksuite/issues/2138',
  });
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, '1🌷1🙅‍♂️1🏳️‍🌈1👨‍👩‍👧‍👦1');
  await pressArrowLeft(page, 1);
  await pressBackspace(page);
  await pressArrowLeft(page, 1);
  await pressBackspace(page);
  await pressArrowLeft(page, 1);
  await pressBackspace(page);
  await pressArrowLeft(page, 1);
  await pressBackspace(page);
  await assertText(page, '11111');
});

test(scoped`delete emoji forward`, async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, '1🌷1🙅‍♂️1🏳️‍🌈1👨‍👩‍👧‍👦1');
  await pressArrowLeft(page, 8);
  await pressForwardDelete(page);
  await pressArrowRight(page, 1);
  await pressForwardDelete(page);
  await pressArrowRight(page, 1);
  await pressForwardDelete(page);
  await pressArrowRight(page, 1);
  await pressForwardDelete(page);
  await assertText(page, '11111');
});

test(
  scoped`ZERO_WIDTH_FOR_EMPTY_LINE should be counted by one cursor position`,
  async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);
    await pressShiftEnter(page);
    await type(page, 'asdfg');
    await pressEnter(page);
    await undoByKeyboard(page);
    await page.waitForTimeout(300);
    await pressBackspace(page);
    await assertRichTexts(page, ['\nasdf']);
  }
);

test('when no note block, click editing area auto add a new note block', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);

  await switchEditorMode(page);
  await page.locator('affine-edgeless-note').click({ force: true });
  await pressBackspace(page);
  await switchEditorMode(page);
  const edgelessNote = await page.evaluate(() => {
    return document.querySelector('affine-edgeless-note');
  });
  expect(edgelessNote).toBeNull();
  await click(page, { x: 200, y: 280 });

  const pageNote = await page.evaluate(() => {
    return document.querySelector('affine-note');
  });
  expect(pageNote).not.toBeNull();
});

test(scoped`automatic identify url text`, async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'abc https://google.com ');

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_final.json`
  );
});

test('ctrl+delete to delete one word forward', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'aaa bbb ccc');
  await pressArrowLeft(page, 8);
  await pressForwardDeleteWord(page);
  await assertText(page, 'aaa ccc');
});

test('extended inline format', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'aaabbbaaa');

  const { boldBtn, italicBtn, underlineBtn, strikeBtn, codeBtn } =
    getFormatBar(page);
  await setSelection(page, 0, 3, 0, 6);
  await boldBtn.click();
  await italicBtn.click();
  await underlineBtn.click();
  await strikeBtn.click();
  await codeBtn.click();
  await assertRichTextInlineDeltas(page, [
    {
      insert: 'aaa',
    },
    {
      insert: 'bbb',
      attributes: {
        bold: true,
        italic: true,
        underline: true,
        strike: true,
        code: true,
      },
    },
    {
      insert: 'aaa',
    },
  ]);

  // aaa|bbbccc
  await setSelection(page, 2, 3, 2, 3);
  await captureHistory(page);
  await type(page, 'c');
  await assertRichTextInlineDeltas(page, [
    {
      insert: 'aaac',
    },
    {
      insert: 'bbb',
      attributes: {
        bold: true,
        italic: true,
        underline: true,
        strike: true,
        code: true,
      },
    },
    {
      insert: 'aaa',
    },
  ]);
  await undoByKeyboard(page);

  // aaab|bbccc
  await setSelection(page, 2, 4, 2, 4);
  await type(page, 'c');
  await assertRichTextInlineDeltas(page, [
    {
      insert: 'aaa',
    },
    {
      insert: 'bcbb',
      attributes: {
        bold: true,
        italic: true,
        underline: true,
        strike: true,
        code: true,
      },
    },
    {
      insert: 'aaa',
    },
  ]);
  await undoByKeyboard(page);

  // aaab|b|bccc
  await setSelection(page, 2, 4, 2, 5);
  await type(page, 'c');
  await assertRichTextInlineDeltas(page, [
    {
      insert: 'aaa',
    },
    {
      insert: 'bcb',
      attributes: {
        bold: true,
        italic: true,
        underline: true,
        strike: true,
        code: true,
      },
    },
    {
      insert: 'aaa',
    },
  ]);
  await undoByKeyboard(page);

  // aaabbb|ccc
  await setSelection(page, 2, 6, 2, 6);
  await type(page, 'c');
  await assertRichTextInlineDeltas(page, [
    {
      insert: 'aaa',
    },
    {
      insert: 'bbb',
      attributes: {
        bold: true,
        italic: true,
        underline: true,
        strike: true,
        code: true,
      },
    },
    {
      insert: 'c',
      attributes: {
        bold: true,
        italic: true,
        underline: true,
        strike: true,
      },
    },
    {
      insert: 'aaa',
    },
  ]);
});
