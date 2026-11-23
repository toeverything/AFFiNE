import {
  enterPlaygroundRoom,
  focusRichText,
  getCursorBlockIdAndHeight,
  initEmptyParagraphState,
  pressArrowLeft,
  pressArrowRight,
  pressBackspace,
  pressEnter,
  pressSpace,
  redoByKeyboard,
  resetHistory,
  type,
  undoByClick,
  undoByKeyboard,
  waitNextFrame,
} from './utils/actions/index.js';
import {
  assertBlockType,
  assertRichTextInlineDeltas,
  assertRichTextInlineRange,
  assertRichTexts,
  assertText,
} from './utils/asserts.js';
import { test } from './utils/playwright.js';

test('markdown shortcut', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await resetHistory(page);

  let id: string | null = null;

  await waitNextFrame(page);
  await type(page, '[] ');
  await waitNextFrame(page);
  [id] = await getCursorBlockIdAndHeight(page);
  await assertBlockType(page, id, 'todo');
  await undoByKeyboard(page);
  await assertText(page, '[] ');
  await undoByKeyboard(page);
  //FIXME: it just failed in playwright
  await focusRichText(page);
  await assertRichTexts(page, ['']);

  await waitNextFrame(page);
  await type(page, '[ ] ');
  await waitNextFrame(page);
  [id] = await getCursorBlockIdAndHeight(page);
  await assertBlockType(page, id, 'todo');
  await undoByKeyboard(page);
  await assertText(page, '[ ] ');
  await undoByKeyboard(page);
  //FIXME: it just failed in playwright
  await focusRichText(page);
  await assertRichTexts(page, ['']);

  await waitNextFrame(page);
  await type(page, '[x] ');
  await waitNextFrame(page);
  [id] = await getCursorBlockIdAndHeight(page);
  await assertBlockType(page, id, 'todo');
  await undoByKeyboard(page);
  await assertText(page, '[x] ');
  await undoByKeyboard(page);
  await assertRichTexts(page, ['']);

  await waitNextFrame(page);
  await type(page, '* ');
  await waitNextFrame(page);
  [id] = await getCursorBlockIdAndHeight(page);
  await assertBlockType(page, id, 'bulleted');
  await undoByKeyboard(page);
  await assertText(page, '* ');
  await undoByKeyboard(page);
  await assertRichTexts(page, ['']);

  await waitNextFrame(page);
  await type(page, '- ');
  await waitNextFrame(page);
  [id] = await getCursorBlockIdAndHeight(page);
  await assertBlockType(page, id, 'bulleted');
  await undoByKeyboard(page);
  await assertText(page, '- ');
  await undoByKeyboard(page);
  await assertRichTexts(page, ['']);

  await waitNextFrame(page);
  await type(page, '1. ');
  await waitNextFrame(page);
  [id] = await getCursorBlockIdAndHeight(page);
  await assertBlockType(page, id, 'numbered');
  await undoByKeyboard(page);
  await assertText(page, '1. ');
  await undoByKeyboard(page);
  await assertRichTexts(page, ['']);

  await waitNextFrame(page);
  await type(page, '20. ');
  await waitNextFrame(page);
  [id] = await getCursorBlockIdAndHeight(page);
  await assertBlockType(page, id, 'numbered');
  await undoByKeyboard(page);
  await assertText(page, '20. ');
  await undoByKeyboard(page);
  await assertRichTexts(page, ['']);

  await waitNextFrame(page);
  await type(page, '# ');
  await waitNextFrame(page);
  [id] = await getCursorBlockIdAndHeight(page);
  await assertBlockType(page, id, 'h1');
  await undoByKeyboard(page);
  await assertText(page, '# ');
  await undoByKeyboard(page);
  await assertRichTexts(page, ['']);

  await waitNextFrame(page);
  await type(page, '## ');
  await waitNextFrame(page);
  [id] = await getCursorBlockIdAndHeight(page);
  await assertBlockType(page, id, 'h2');
  await undoByKeyboard(page);
  await assertText(page, '## ');
  await undoByKeyboard(page);
  await assertRichTexts(page, ['']);

  await waitNextFrame(page);
  await type(page, '### ');
  await waitNextFrame(page);
  [id] = await getCursorBlockIdAndHeight(page);
  await assertBlockType(page, id, 'h3');
  await undoByKeyboard(page);
  await assertText(page, '### ');
  await undoByKeyboard(page);
  await assertRichTexts(page, ['']);

  await waitNextFrame(page);
  await type(page, '#### ');
  await waitNextFrame(page);
  [id] = await getCursorBlockIdAndHeight(page);
  await assertBlockType(page, id, 'h4');
  await undoByKeyboard(page);
  await assertText(page, '#### ');
  await undoByKeyboard(page);
  await assertRichTexts(page, ['']);

  await waitNextFrame(page);
  await type(page, '##### ');
  await waitNextFrame(page);
  [id] = await getCursorBlockIdAndHeight(page);
  await assertBlockType(page, id, 'h5');
  await undoByKeyboard(page);
  await assertText(page, '##### ');
  await undoByKeyboard(page);
  await assertRichTexts(page, ['']);

  await waitNextFrame(page);
  await type(page, '###### ');
  await waitNextFrame(page);
  [id] = await getCursorBlockIdAndHeight(page);
  await assertBlockType(page, id, 'h6');
  await undoByKeyboard(page);
  await assertText(page, '###### ');
  await undoByKeyboard(page);
  await assertRichTexts(page, ['']);

  await waitNextFrame(page);
  await type(page, '> ');
  await waitNextFrame(page);
  [id] = await getCursorBlockIdAndHeight(page);
  await assertBlockType(page, id, 'quote');
  await undoByKeyboard(page);
  await assertText(page, '> ');
  await undoByKeyboard(page);
  await assertRichTexts(page, ['']);

  // testing various horizontal dividers
  await waitNextFrame(page);
  await type(page, '--- ');
  await undoByKeyboard(page);
  await assertRichTexts(page, ['--- ']);
  await undoByKeyboard(page);
  await assertRichTexts(page, ['']);

  await waitNextFrame(page);
  await type(page, '*** ');
  await undoByClick(page);
  await assertRichTexts(page, ['*** ']);
  await undoByClick(page);
  await assertRichTexts(page, ['']);

  await waitNextFrame(page);
  await type(page, '___ ');
  await undoByClick(page);
  await assertRichTexts(page, ['___ ']);
  await undoByClick(page);
  await assertRichTexts(page, ['']);

  await waitNextFrame(page);
  await type(page, '------ ');
  await undoByClick(page);
  await assertRichTexts(page, ['------ ']);
  await undoByClick(page);
  await assertRichTexts(page, ['']);

  await waitNextFrame(page);
  await type(page, '****** ');
  await undoByClick(page);
  await assertRichTexts(page, ['****** ']);
  await undoByClick(page);
  await assertRichTexts(page, ['']);

  await waitNextFrame(page);
  await type(page, '______ ');
  await undoByClick(page);
  await assertRichTexts(page, ['______ ']);
  await undoByClick(page);
  await assertRichTexts(page, ['']);
});

test.describe('markdown inline-text', () => {
  test.beforeEach(async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);
    await resetHistory(page);
  });

  test('bolditalic', async ({ page }) => {
    await type(page, 'aa***b*** ');
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa',
      },
      {
        insert: 'b',
        attributes: {
          bold: true,
          italic: true,
        },
      },
    ]);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await assertRichTexts(page, ['']);

    await type(page, 'aa***bb*** ');
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa',
      },
      {
        insert: 'bb',
        attributes: {
          bold: true,
          italic: true,
        },
      },
    ]);
    await undoByKeyboard(page);
    await assertRichTextInlineRange(page, 0, 11);
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa***bb*** ',
      },
    ]);
    await redoByKeyboard(page);
    await type(page, 'cc');
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa',
      },
      {
        insert: 'bbcc',
        attributes: {
          bold: true,
          italic: true,
        },
      },
    ]);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await assertRichTexts(page, ['']);

    await waitNextFrame(page);
    await type(page, '***test *** ');
    await assertRichTexts(page, ['***test *** ']);
    await undoByKeyboard(page);
    await assertRichTexts(page, ['']);

    // *** + space will be converted to divider, so needn't test this case here
    // await waitNextFrame(page);
    // await type(page, '*** test*** ');
    // await assertRichTexts(page, ['*** test*** ']);
    // await undoByKeyboard(page);
    // await assertRichTexts(page, ['']);
  });

  test('bold', async ({ page }) => {
    await type(page, 'aa**b** ');
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa',
      },
      {
        insert: 'b',
        attributes: {
          bold: true,
        },
      },
    ]);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await assertRichTexts(page, ['']);

    await type(page, 'aa**bb** ');
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa',
      },
      {
        insert: 'bb',
        attributes: {
          bold: true,
        },
      },
    ]);
    await undoByKeyboard(page);
    await assertRichTextInlineRange(page, 0, 9);
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa**bb** ',
      },
    ]);
    await redoByKeyboard(page);
    await type(page, 'cc');
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa',
      },
      {
        insert: 'bbcc',
        attributes: {
          bold: true,
        },
      },
    ]);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await assertRichTexts(page, ['']);

    await waitNextFrame(page);
    await type(page, '**test ** ');
    await assertRichTexts(page, ['**test ** ']);
    await undoByKeyboard(page);
    await assertRichTexts(page, ['']);

    await waitNextFrame(page);
    await type(page, '** test** ');
    await assertRichTexts(page, ['** test** ']);
    await undoByKeyboard(page);
    await assertRichTexts(page, ['']);
  });

  test('italic', async ({ page }) => {
    await type(page, 'aa*b* ');
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa',
      },
      {
        insert: 'b',
        attributes: {
          italic: true,
        },
      },
    ]);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await assertRichTexts(page, ['']);

    await type(page, 'aa*bb* ');
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa',
      },
      {
        insert: 'bb',
        attributes: {
          italic: true,
        },
      },
    ]);
    await undoByKeyboard(page);
    await assertRichTextInlineRange(page, 0, 7);
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa*bb* ',
      },
    ]);
    await redoByKeyboard(page);
    await type(page, 'cc');
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa',
      },
      {
        insert: 'bbcc',
        attributes: {
          italic: true,
        },
      },
    ]);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await assertRichTexts(page, ['']);

    await waitNextFrame(page);
    await type(page, '*test * ');
    await assertRichTexts(page, ['*test * ']);
    await undoByKeyboard(page);
    await assertRichTexts(page, ['']);

    // * + space will be converted to bulleted list, so needn't test this case here
    // await waitNextFrame(page);
    // await type(page, '* test* ');
    // await assertRichTexts(page, ['* test* ']);
    // await undoByKeyboard(page);
    // await assertRichTexts(page, ['']);
  });

  test('strike', async ({ page }) => {
    await type(page, 'aa~~b~~ ');
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa',
      },
      {
        insert: 'b',
        attributes: {
          strike: true,
        },
      },
    ]);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await assertRichTexts(page, ['']);

    await type(page, 'aa~~bb~~ ');
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa',
      },
      {
        insert: 'bb',
        attributes: {
          strike: true,
        },
      },
    ]);
    await undoByKeyboard(page);
    await assertRichTextInlineRange(page, 0, 9);
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa~~bb~~ ',
      },
    ]);
    await redoByKeyboard(page);
    await type(page, 'cc');
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa',
      },
      {
        insert: 'bbcc',
        attributes: {
          strike: true,
        },
      },
    ]);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await assertRichTexts(page, ['']);

    await waitNextFrame(page);
    await type(page, '~~test ~~ ');
    await assertRichTexts(page, ['~~test ~~ ']);
    await undoByKeyboard(page);
    await assertRichTexts(page, ['']);

    await waitNextFrame(page);
    await type(page, '~~ test~~ ');
    await assertRichTexts(page, ['~~ test~~ ']);
    await undoByKeyboard(page);
    await assertRichTexts(page, ['']);
  });

  test('underline', async ({ page }) => {
    await type(page, 'aa~b~ ');
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa',
      },
      {
        insert: 'b',
        attributes: {
          underline: true,
        },
      },
    ]);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await assertRichTexts(page, ['']);

    await type(page, 'aa~bb~ ');
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa',
      },
      {
        insert: 'bb',
        attributes: {
          underline: true,
        },
      },
    ]);
    await undoByKeyboard(page);
    await assertRichTextInlineRange(page, 0, 7);
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa~bb~ ',
      },
    ]);
    await redoByKeyboard(page);
    await type(page, 'cc');
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa',
      },
      {
        insert: 'bbcc',
        attributes: {
          underline: true,
        },
      },
    ]);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await assertRichTexts(page, ['']);

    await waitNextFrame(page);
    await type(page, '~test ~ ');
    await assertRichTexts(page, ['~test ~ ']);
    await undoByKeyboard(page);
    await assertRichTexts(page, ['']);

    await waitNextFrame(page);
    await type(page, '~ test~ ');
    await assertRichTexts(page, ['~ test~ ']);
    await undoByKeyboard(page);
    await assertRichTexts(page, ['']);
  });

  test('code', async ({ page }) => {
    await type(page, 'aa`b` ');
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa',
      },
      {
        insert: 'b',
        attributes: {
          code: true,
        },
      },
    ]);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await assertRichTexts(page, ['']);

    await type(page, 'aa`bb` ');
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa',
      },
      {
        insert: 'bb',
        attributes: {
          code: true,
        },
      },
    ]);
    await undoByKeyboard(page);
    await assertRichTextInlineRange(page, 0, 7);
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa`bb` ',
      },
    ]);
    await redoByKeyboard(page);
    await type(page, 'cc');
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'aa',
      },
      {
        insert: 'bb',
        attributes: {
          code: true,
        },
      },
      {
        insert: 'cc',
      },
    ]);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await undoByKeyboard(page);
    await assertRichTexts(page, ['']);

    await waitNextFrame(page);
    await type(page, '`test ` ');
    await assertRichTexts(page, ['`test ` ']);
    await undoByKeyboard(page);
    await assertRichTexts(page, ['']);

    await waitNextFrame(page);
    await type(page, '` test` ');
    await assertRichTexts(page, ['` test` ']);
    await undoByKeyboard(page);
    await assertRichTexts(page, ['']);

    // https://github.com/toeverything/AFFiNE/issues/9410
    await waitNextFrame(page);
    await type(page, 'test**bold** ');
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'test',
      },
      {
        insert: 'bold',
        attributes: {
          bold: true,
        },
      },
    ]);
    await pressArrowLeft(page, 8);
    await type(page, '`');
    await pressArrowRight(page, 8);
    await type(page, '` ');
    await assertRichTextInlineDeltas(page, [
      {
        insert: 'test',
        attributes: {
          code: true,
        },
      },
      {
        insert: 'bold',
        attributes: {
          bold: true,
          code: true,
        },
      },
    ]);
  });
});

test('inline code should work when pressing Enter followed by Backspace twice', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await type(page, '`test`');
  await pressSpace(page);
  await waitNextFrame(page);
  await pressArrowLeft(page);
  await waitNextFrame(page);
  await pressEnter(page);
  await waitNextFrame(page);
  await pressBackspace(page);
  await waitNextFrame(page);
  await pressEnter(page);
  await waitNextFrame(page);
  await pressBackspace(page);

  await assertRichTexts(page, ['test']);
});
