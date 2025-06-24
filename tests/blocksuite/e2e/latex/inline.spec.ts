import { expect } from '@playwright/test';

import {
  cutByKeyboard,
  pasteByKeyboard,
  pressArrowLeft,
  pressArrowRight,
  pressArrowUp,
  pressBackspace,
  pressBackspaceWithShortKey,
  pressEnter,
  pressShiftEnter,
  redoByKeyboard,
  selectAllByKeyboard,
  type,
  undoByKeyboard,
} from '../utils/actions/keyboard.js';
import {
  enterPlaygroundRoom,
  focusRichText,
  initEmptyParagraphState,
} from '../utils/actions/misc.js';
import {
  assertRichTextInlineDeltas,
  assertRichTextInlineRange,
} from '../utils/asserts.js';
import { ZERO_WIDTH_FOR_EMPTY_LINE } from '../utils/inline-editor.js';
import { test } from '../utils/playwright.js';

test('add inline latex at the start of line', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  const latexEditorLine = page.locator('latex-editor-menu v-line div');
  const latexElement = page.locator(
    'affine-paragraph rich-text affine-latex-node'
  );

  expect(await latexEditorLine.isVisible()).not.toBeTruthy();
  expect(await latexElement.isVisible()).not.toBeTruthy();
  await type(page, '$$ ');
  expect(await latexEditorLine.isVisible()).toBeTruthy();
  expect(await latexElement.isVisible()).toBeTruthy();
  expect(await latexElement.locator('.placeholder').innerText()).toBe(
    'Equation'
  );
  await type(page, 'E=mc^2');
  expect(await latexEditorLine.innerText()).toBe('E=mc^2');
  const innerHTML = await latexElement.locator('.katex').innerHTML();
  expect(innerHTML).toMatchSnapshot(`${testInfo.title}.html`);

  await pressEnter(page);
  expect(await latexEditorLine.isVisible()).not.toBeTruthy();
  expect(await latexElement.locator('.katex').innerHTML()).toBe(innerHTML);
});

test('add inline latex in the middle of text', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  const latexEditorLine = page.locator('latex-editor-menu v-line div');
  const latexElement = page.locator(
    'affine-paragraph rich-text affine-latex-node'
  );

  expect(await latexEditorLine.isVisible()).not.toBeTruthy();
  expect(await latexElement.isVisible()).not.toBeTruthy();
  await type(page, 'aaaa');
  await pressArrowLeft(page, 2);
  await type(page, '$$ ');
  expect(await latexEditorLine.isVisible()).toBeTruthy();
  expect(await latexElement.isVisible()).toBeTruthy();
  expect(await latexElement.locator('.placeholder').innerText()).toBe(
    'Equation'
  );
  await type(page, 'E=mc^2');
  expect(await latexEditorLine.innerText()).toBe('E=mc^2');

  const innerHTML = await latexElement.locator('.katex').innerHTML();
  expect(innerHTML).toMatchSnapshot(`${testInfo.title}.html`);

  await pressEnter(page);
  expect(await latexEditorLine.isVisible()).not.toBeTruthy();
  expect(await latexElement.locator('.katex').innerHTML()).toBe(innerHTML);
});

test('update inline latex by clicking the node', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  const latexEditorLine = page.locator('latex-editor-menu v-line div');
  const latexElement = page.locator(
    'affine-paragraph rich-text affine-latex-node'
  );

  expect(await latexEditorLine.isVisible()).not.toBeTruthy();
  await type(page, '$$ ');
  expect(await latexEditorLine.isVisible()).toBeTruthy();
  await type(page, 'E=mc^2');
  await pressEnter(page);
  expect(await latexEditorLine.isVisible()).not.toBeTruthy();
  await latexElement.click();
  expect(await latexEditorLine.isVisible()).toBeTruthy();
  await pressBackspace(page, 6);
  await type(page, String.raw`\def\arraystretch{1.5}`);
  await pressShiftEnter(page);
  await type(page, String.raw`\begin{array}{c:c:c}`);
  await pressShiftEnter(page);
  await type(page, String.raw`a & b & c \\ \\ hline`);
  await pressShiftEnter(page);
  await type(page, String.raw`d & e & f \\`);
  await pressShiftEnter(page);
  await type(page, String.raw`\hdashline`);
  await pressShiftEnter(page);
  await type(page, String.raw`g & h & i`);
  await pressShiftEnter(page);
  await type(page, String.raw`\end{array}`);

  const innerHTML = await latexElement.locator('.katex').innerHTML();
  expect(innerHTML).toMatchSnapshot(`${testInfo.title}.html`);

  // click outside to hide the editor
  await page.click('affine-editor-container');
  expect(await latexEditorLine.isVisible()).not.toBeTruthy();
});

test('latex editor', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  const latexEditorLine = page.locator('latex-editor-menu v-line div');
  const latexElement = page.locator(
    'affine-paragraph rich-text affine-latex-node'
  );

  expect(await latexEditorLine.isVisible()).not.toBeTruthy();
  await type(page, '$$ ');
  expect(await latexEditorLine.isVisible()).toBeTruthy();
  // test cursor movement works as expected
  // https://github.com/toeverything/blocksuite/pull/8368
  await type(page, 'ababababababababababababababababababababababababab');
  expect(await latexEditorLine.innerText()).toBe(
    'ababababababababababababababababababababababababab'
  );
  // click outside to hide the editor
  expect(await latexEditorLine.isVisible()).toBeTruthy();
  await page.mouse.click(130, 130);
  expect(await latexEditorLine.isVisible()).not.toBeTruthy();
  await latexElement.click();
  expect(await latexEditorLine.isVisible()).toBeTruthy();
  expect(await latexEditorLine.innerText()).toBe(
    'ababababababababababababababababababababababababab'
  );

  await pressBackspaceWithShortKey(page, 2);
  expect(await latexEditorLine.innerText()).toBe(ZERO_WIDTH_FOR_EMPTY_LINE);
  await undoByKeyboard(page);
  expect(await latexEditorLine.innerText()).toBe(
    'ababababababababababababababababababababababababab'
  );
  await redoByKeyboard(page);
  expect(await latexEditorLine.innerText()).toBe(ZERO_WIDTH_FOR_EMPTY_LINE);
  await undoByKeyboard(page);
  expect(await latexEditorLine.innerText()).toBe(
    'ababababababababababababababababababababababababab'
  );

  // undo-redo
  await pressArrowLeft(page, 5);
  await page.keyboard.down('Shift');
  await pressArrowUp(page);
  await pressArrowRight(page);
  await page.keyboard.up('Shift');
  /**
   * abababababababababab|ababab
   * abababababababababa|babab
   */
  await cutByKeyboard(page);
  expect(await latexEditorLine.innerText()).toBe('ababababababababababababab');
  /**
   * abababababababababab|babab
   */
  await pressArrowRight(page, 2);
  /**
   * ababababababababababba|bab
   */
  await pasteByKeyboard(page);
  expect(await latexEditorLine.innerText()).toBe(
    'ababababababababababababababababababababababababab'
  );

  await selectAllByKeyboard(page);
  await pressBackspace(page);
  expect(await latexEditorLine.innerText()).toBe(ZERO_WIDTH_FOR_EMPTY_LINE);

  // highlight
  await type(
    page,
    String.raw`a+\left(\vcenter{\hbox{$\frac{\frac a b}c$}}\right)`
  );
  expect(
    (await latexEditorLine.locator('latex-editor-unit').innerHTML()).replace(
      /lit\$\d+\$/g,
      'lit$test$'
    )
  ).toBe(
    '\x3C!----><span>\x3C!--?lit$test$-->\x3C!----><v-text style="color:#000000;">\x3C!----><span data-v-text="true" style="word-break:break-word;text-wrap:wrap;white-space-collapse:break-spaces;">\x3C!--?lit$test$-->a+</span></v-text>\x3C!---->\x3C!----><v-text style="color:#795E26;">\x3C!----><span data-v-text="true" style="word-break:break-word;text-wrap:wrap;white-space-collapse:break-spaces;">\x3C!--?lit$test$-->\\left</span></v-text>\x3C!---->\x3C!----><v-text style="color:#000000;">\x3C!----><span data-v-text="true" style="word-break:break-word;text-wrap:wrap;white-space-collapse:break-spaces;">\x3C!--?lit$test$-->(</span></v-text>\x3C!---->\x3C!----><v-text style="color:#795E26;">\x3C!----><span data-v-text="true" style="word-break:break-word;text-wrap:wrap;white-space-collapse:break-spaces;">\x3C!--?lit$test$-->\\vcenter</span></v-text>\x3C!---->\x3C!----><v-text style="color:#000000;">\x3C!----><span data-v-text="true" style="word-break:break-word;text-wrap:wrap;white-space-collapse:break-spaces;">\x3C!--?lit$test$-->{</span></v-text>\x3C!---->\x3C!----><v-text style="color:#795E26;">\x3C!----><span data-v-text="true" style="word-break:break-word;text-wrap:wrap;white-space-collapse:break-spaces;">\x3C!--?lit$test$-->\\hbox</span></v-text>\x3C!---->\x3C!----><v-text style="color:#000000;">\x3C!----><span data-v-text="true" style="word-break:break-word;text-wrap:wrap;white-space-collapse:break-spaces;">\x3C!--?lit$test$-->{</span></v-text>\x3C!---->\x3C!----><v-text style="color:#267F99;">\x3C!----><span data-v-text="true" style="word-break:break-word;text-wrap:wrap;white-space-collapse:break-spaces;">\x3C!--?lit$test$-->$</span></v-text>\x3C!---->\x3C!----><v-text style="color:#267F99;">\x3C!----><span data-v-text="true" style="word-break:break-word;text-wrap:wrap;white-space-collapse:break-spaces;">\x3C!--?lit$test$-->\\frac{\\frac a b}c</span></v-text>\x3C!---->\x3C!----><v-text style="color:#267F99;">\x3C!----><span data-v-text="true" style="word-break:break-word;text-wrap:wrap;white-space-collapse:break-spaces;">\x3C!--?lit$test$-->$</span></v-text>\x3C!---->\x3C!----><v-text style="color:#000000;">\x3C!----><span data-v-text="true" style="word-break:break-word;text-wrap:wrap;white-space-collapse:break-spaces;">\x3C!--?lit$test$-->}}</span></v-text>\x3C!---->\x3C!----><v-text style="color:#795E26;">\x3C!----><span data-v-text="true" style="word-break:break-word;text-wrap:wrap;white-space-collapse:break-spaces;">\x3C!--?lit$test$-->\\right</span></v-text>\x3C!---->\x3C!----><v-text style="color:#000000;">\x3C!----><span data-v-text="true" style="word-break:break-word;text-wrap:wrap;white-space-collapse:break-spaces;">\x3C!--?lit$test$-->)</span></v-text>\x3C!----></span>'
  );
});

test('add inline latex using slash menu', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  const latexEditorLine = page.locator('latex-editor-menu v-line div');
  const latexElement = page.locator(
    'affine-paragraph rich-text affine-latex-node'
  );

  expect(await latexEditorLine.isVisible()).not.toBeTruthy();
  expect(await latexElement.isVisible()).not.toBeTruthy();
  await type(page, '/ieq\n');
  expect(await latexEditorLine.isVisible()).toBeTruthy();
  expect(await latexElement.isVisible()).toBeTruthy();
  expect(await latexElement.locator('.placeholder').innerText()).toBe(
    'Equation'
  );
  await type(page, 'E=mc^2');
  expect(await latexEditorLine.innerText()).toBe('E=mc^2');
  const innerHTML = await latexElement.locator('.katex').innerHTML();
  expect(innerHTML).toMatchSnapshot(`${testInfo.title}.html`);

  await pressEnter(page);
  expect(await latexEditorLine.isVisible()).not.toBeTruthy();
  expect(await latexElement.locator('.katex').innerHTML()).toBe(innerHTML);
});

test('add inline latex using markdown shortcut', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  // toggle by space or enter
  await type(page, 'aa$$bb$$ cc$$dd$$\n');
  await assertRichTextInlineDeltas(page, [
    {
      insert: 'aa',
    },
    {
      insert: ' ',
      attributes: {
        latex: 'bb',
      },
    },
    {
      insert: 'cc',
    },
    {
      insert: ' ',
      attributes: {
        latex: 'dd',
      },
    },
  ]);

  await pressArrowUp(page);
  await pressArrowRight(page, 3);
  await pressBackspace(page);
  await assertRichTextInlineDeltas(page, [
    {
      insert: 'aacc',
    },
    {
      insert: ' ',
      attributes: {
        latex: 'dd',
      },
    },
  ]);
});

test('undo-redo when add inline latex using markdown shortcut', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await type(page, 'aa$$bb$$ ');
  await assertRichTextInlineDeltas(page, [
    {
      insert: 'aa',
    },
    {
      insert: ' ',
      attributes: {
        latex: 'bb',
      },
    },
  ]);
  await assertRichTextInlineRange(page, 0, 3, 0);

  await undoByKeyboard(page);
  await assertRichTextInlineDeltas(page, [
    {
      insert: 'aa$$bb$$ ',
    },
  ]);
  await assertRichTextInlineRange(page, 0, 9, 0);

  await redoByKeyboard(page);
  await assertRichTextInlineDeltas(page, [
    {
      insert: 'aa',
    },
    {
      insert: ' ',
      attributes: {
        latex: 'bb',
      },
    },
  ]);
  await assertRichTextInlineRange(page, 0, 3, 0);
});

test('auto focus after add inline latex using markdown shortcut', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await type(page, 'aa$$ bbb\ncc');
  await assertRichTextInlineDeltas(page, [
    {
      insert: 'aa',
    },
    {
      insert: ' ',
      attributes: {
        latex: 'bbb',
      },
    },
    {
      insert: 'cc',
    },
  ]);

  await undoByKeyboard(page);
  await assertRichTextInlineDeltas(page, [
    {
      insert: 'aa',
    },
    {
      insert: ' ',
      attributes: {
        latex: 'bbb',
      },
    },
  ]);
  await redoByKeyboard(page);
  await assertRichTextInlineDeltas(page, [
    {
      insert: 'aa',
    },
    {
      insert: ' ',
      attributes: {
        latex: 'bbb',
      },
    },
    {
      insert: 'cc',
    },
  ]);
});
