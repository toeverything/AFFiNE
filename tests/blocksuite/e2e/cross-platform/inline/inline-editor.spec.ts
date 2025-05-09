import type { InlineEditor, InlineRange } from '@blocksuite/affine/std/inline';
import type { DeltaInsert } from '@blocksuite/affine/store';
import { expect, type Page, test } from '@playwright/test';

import { press } from '../../database/actions.js';
import {
  pressArrowLeft,
  pressBackspace,
  pressEnter,
  type,
} from '../../utils/actions/keyboard.js';
import {
  enterPlaygroundRoom,
  focusRichText,
  initEmptyParagraphState,
} from '../../utils/actions/misc.js';
import { assertRichTextInlineDeltas } from '../../utils/asserts.js';
import { ZERO_WIDTH_FOR_EMPTY_LINE } from '../../utils/inline-editor.js';

// FIXME(mirone): copy paste from framework/inline/__tests__/utils.ts
const defaultPlaygroundURL = new URL(
  `http://localhost:${process.env.CI ? 4173 : 5173}/`
);

async function enterInlineEditorPlayground(page: Page) {
  const url = new URL('examples/inline/index.html', defaultPlaygroundURL);
  await page.goto(url.toString());
}

async function focusInlineRichText(page: Page, index = 0): Promise<void> {
  await page.evaluate(index => {
    const richTexts = document
      .querySelector('test-page')
      ?.querySelectorAll('test-rich-text');

    if (!richTexts) {
      throw new Error('Cannot find test-rich-text');
    }

    (richTexts[index] as any).inlineEditor.focusEnd();
  }, index);
}

async function getDeltaFromInlineRichText(
  page: Page,
  index = 0
): Promise<DeltaInsert> {
  await page.waitForTimeout(100);
  return page.evaluate(index => {
    const richTexts = document
      .querySelector('test-page')
      ?.querySelectorAll('test-rich-text');

    if (!richTexts) {
      throw new Error('Cannot find test-rich-text');
    }

    const editor = (richTexts[index] as any).inlineEditor as InlineEditor;
    return editor.yText.toDelta();
  }, index);
}

async function setInlineRichTextRange(
  page: Page,
  inlineRange: InlineRange,
  index = 0
): Promise<void> {
  await page.evaluate(
    ([inlineRange, index]) => {
      const richTexts = document
        .querySelector('test-page')
        ?.querySelectorAll('test-rich-text');

      if (!richTexts) {
        throw new Error('Cannot find test-rich-text');
      }

      const editor = (richTexts[index as number] as any)
        .inlineEditor as InlineEditor;
      editor.setInlineRange(inlineRange as InlineRange);
    },
    [inlineRange, index]
  );
}

async function getInlineRichTextLine(
  page: Page,
  index: number,
  i = 0
): Promise<readonly [string, number]> {
  return page.evaluate(
    ([index, i]) => {
      const richTexts = document.querySelectorAll('test-rich-text');

      if (!richTexts) {
        throw new Error('Cannot find test-rich-text');
      }

      const editor = (richTexts[i] as any).inlineEditor as InlineEditor;
      const result = editor.getLine(index);
      if (!result) {
        throw new Error('Cannot find line');
      }
      const { line, rangeIndexRelatedToLine } = result;
      return [line.vTextContent, rangeIndexRelatedToLine] as const;
    },
    [index, i]
  );
}

async function getInlineRangeIndexRect(
  page: Page,
  [richTextIndex, inlineIndex]: [number, number],
  coordOffSet: { x: number; y: number } = { x: 0, y: 0 }
) {
  const rect = await page.evaluate(
    ({ richTextIndex, inlineIndex: vIndex, coordOffSet }) => {
      const richText = document.querySelectorAll('test-rich-text')[
        richTextIndex
      ] as any;
      const domRange = richText.inlineEditor.toDomRange({
        index: vIndex,
        length: 0,
      });
      const pointBound = domRange.getBoundingClientRect();
      return {
        x: pointBound.left + coordOffSet.x,
        y: pointBound.top + pointBound.height / 2 + coordOffSet.y,
      };
    },
    {
      richTextIndex,
      inlineIndex,
      coordOffSet,
    }
  );
  return rect;
}

async function assertSelection(
  page: Page,
  richTextIndex: number,
  rangeIndex: number,
  rangeLength = 0
) {
  const actual = await page.evaluate(
    ([richTextIndex]) => {
      const richText =
        document?.querySelectorAll('test-rich-text')[richTextIndex];
      // @ts-expect-error getInlineRange
      const inlineEditor = richText.inlineEditor;
      return inlineEditor?.getInlineRange();
    },
    [richTextIndex]
  );
  expect(actual).toEqual({ index: rangeIndex, length: rangeLength });
}

test('basic input', async ({ page, browserName }) => {
  await enterInlineEditorPlayground(page);
  await focusInlineRichText(page);

  const editorA = page.locator('[data-v-root="true"]').nth(0);
  const editorB = page.locator('[data-v-root="true"]').nth(1);

  const editorAUndo = page.getByText('undo').nth(0);
  const editorARedo = page.getByText('redo').nth(0);

  await expect(editorA).toHaveText(ZERO_WIDTH_FOR_EMPTY_LINE);
  await expect(editorB).toHaveText(ZERO_WIDTH_FOR_EMPTY_LINE);

  await page.waitForTimeout(100);

  await type(page, 'abcd😃efg👨‍👨‍👧‍👦hj');

  await expect(editorA).toHaveText('abcd😃efg👨‍👨‍👧‍👦hj');
  await expect(editorB).toHaveText('abcd😃efg👨‍👨‍👧‍👦hj');

  await editorAUndo.click();

  await expect(editorA).toHaveText(ZERO_WIDTH_FOR_EMPTY_LINE);
  await expect(editorB).toHaveText(ZERO_WIDTH_FOR_EMPTY_LINE);

  await editorARedo.click();

  await expect(editorA).toHaveText('abcd😃efg👨‍👨‍👧‍👦hj');
  await expect(editorB).toHaveText('abcd😃efg👨‍👨‍👧‍👦hj');

  await focusInlineRichText(page);
  await pressBackspace(page, 2); // remove j and h
  // see https://github.com/microsoft/vscode/issues/99629#issuecomment-831565509
  await pressBackspace(page, browserName === 'firefox' ? 5 : 1);

  await expect(editorA).toHaveText('abcd😃efg');
  await expect(editorB).toHaveText('abcd😃efg');

  await editorAUndo.click();

  await expect(editorA).toHaveText('abcd😃efg👨‍👨‍👧‍👦hj');
  await expect(editorB).toHaveText('abcd😃efg👨‍👨‍👧‍👦hj');

  await editorARedo.click();

  await expect(editorA).toHaveText('abcd😃efg');
  await expect(editorB).toHaveText('abcd😃efg');

  await focusInlineRichText(page);
  await press(page, 'ArrowLeft');
  await press(page, 'ArrowLeft');
  await press(page, 'ArrowLeft');
  await press(page, 'ArrowLeft');
  await press(page, 'ArrowLeft');
  await press(page, 'Delete');
  await press(page, 'Delete');

  await type(page, '🥰👨‍👨‍👧‍👦');
  await expect(editorA).toHaveText('abc🥰👨‍👨‍👧‍👦efg');
  await expect(editorB).toHaveText('abc🥰👨‍👨‍👧‍👦efg');

  await setInlineRichTextRange(page, {
    index: 3,
    length: 16,
  });
  await page.waitForTimeout(100);
  await press(page, 'Delete');

  await expect(editorA).toHaveText('abc');
  await expect(editorB).toHaveText('abc');

  await editorAUndo.click();

  await expect(editorA).toHaveText('abcd😃efg');
  await expect(editorB).toHaveText('abcd😃efg');

  await editorARedo.click();

  await expect(editorA).toHaveText('abc');
  await expect(editorB).toHaveText('abc');

  await focusInlineRichText(page);
  await page.waitForTimeout(100);
  await press(page, 'Enter');
  await press(page, 'Enter');
  await type(page, 'bbb');

  await page.waitForTimeout(100);

  await expect(editorA).toHaveText(
    'abc\n' + ZERO_WIDTH_FOR_EMPTY_LINE + '\nbbb',
    {
      useInnerText: true, // for multi-line text
    }
  );
  await expect(editorB).toHaveText(
    'abc\n' + ZERO_WIDTH_FOR_EMPTY_LINE + '\nbbb',
    {
      useInnerText: true, // for multi-line text
    }
  );

  await editorAUndo.click();

  await expect(editorA).toHaveText('abc');
  await expect(editorB).toHaveText('abc');

  await editorARedo.click();

  await expect(editorA).toHaveText(
    'abc\n' + ZERO_WIDTH_FOR_EMPTY_LINE + '\nbbb',
    {
      useInnerText: true, // for multi-line text
    }
  );
  await expect(editorB).toHaveText(
    'abc\n' + ZERO_WIDTH_FOR_EMPTY_LINE + '\nbbb',
    {
      useInnerText: true, // for multi-line text
    }
  );

  await focusInlineRichText(page);
  await page.waitForTimeout(100);
  await pressBackspace(page, 5);

  await expect(editorA).toHaveText('abc');
  await expect(editorB).toHaveText('abc');

  await editorAUndo.click();

  await expect(editorA).toHaveText(
    'abc\n' + ZERO_WIDTH_FOR_EMPTY_LINE + '\nbbb',
    {
      useInnerText: true, // for multi-line text
    }
  );
  await expect(editorB).toHaveText(
    'abc\n' + ZERO_WIDTH_FOR_EMPTY_LINE + '\nbbb',
    {
      useInnerText: true, // for multi-line text
    }
  );

  await editorARedo.click();

  await expect(editorA).toHaveText('abc');
  await expect(editorB).toHaveText('abc');

  await focusInlineRichText(page);
  await page.waitForTimeout(100);
  await press(page, 'ArrowLeft');
  await press(page, 'ArrowLeft');
  await type(page, 'bb');
  await press(page, 'ArrowRight');
  await press(page, 'ArrowRight');
  await type(page, 'dd');

  await expect(editorA).toHaveText('abbbcdd');
  await expect(editorB).toHaveText('abbbcdd');

  await editorAUndo.click();

  await expect(editorA).toHaveText('abc');

  await editorARedo.click();

  await expect(editorA).toHaveText('abbbcdd');
  await expect(editorB).toHaveText('abbbcdd');

  await focusInlineRichText(page);
  await page.waitForTimeout(100);
  await press(page, 'ArrowLeft');
  await press(page, 'ArrowLeft');
  await press(page, 'Enter');
  await press(page, 'Enter');

  await expect(editorA).toHaveText(
    'abbbc\n' + ZERO_WIDTH_FOR_EMPTY_LINE + '\ndd',
    {
      useInnerText: true, // for multi-line text
    }
  );
  await expect(editorB).toHaveText(
    'abbbc\n' + ZERO_WIDTH_FOR_EMPTY_LINE + '\ndd',
    {
      useInnerText: true, // for multi-line text
    }
  );

  await editorAUndo.click();

  await expect(editorA).toHaveText('abbbcdd');
  await expect(editorB).toHaveText('abbbcdd');

  await editorARedo.click();

  await expect(editorA).toHaveText(
    'abbbc\n' + ZERO_WIDTH_FOR_EMPTY_LINE + '\ndd',
    {
      useInnerText: true, // for multi-line text
    }
  );
  await expect(editorB).toHaveText(
    'abbbc\n' + ZERO_WIDTH_FOR_EMPTY_LINE + '\ndd',
    {
      useInnerText: true, // for multi-line text
    }
  );
});

test('chinese input', async ({ page, browserName }) => {
  test.skip(
    browserName !== 'chromium',
    'CDPSession is only supported in chromium'
  );

  await enterInlineEditorPlayground(page);
  await focusInlineRichText(page);

  const editorA = page.locator('[data-v-root="true"]').nth(0);
  const editorB = page.locator('[data-v-root="true"]').nth(1);

  await expect(editorA).toHaveText(ZERO_WIDTH_FOR_EMPTY_LINE);
  await expect(editorB).toHaveText(ZERO_WIDTH_FOR_EMPTY_LINE);

  await page.waitForTimeout(100);
  const client = await page.context().newCDPSession(page);
  await client.send('Input.imeSetComposition', {
    selectionStart: 0,
    selectionEnd: 0,
    text: 'n',
  });
  await client.send('Input.imeSetComposition', {
    selectionStart: 0,
    selectionEnd: 1,
    text: 'ni',
  });
  await client.send('Input.insertText', {
    text: '你',
  });
  await expect(editorA).toHaveText('你');
  await expect(editorB).toHaveText('你');
});

test('type many times in one moment', async ({ page }) => {
  await enterInlineEditorPlayground(page);
  await focusInlineRichText(page);
  await page.waitForTimeout(100);
  await Promise.all(
    'aaaaaaaaaaaaaaaaaaaa'.split('').map(s => page.keyboard.type(s))
  );
  const preOffset = await page.evaluate(() => {
    return getSelection()?.getRangeAt(0).endOffset;
  });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const offset = await page.evaluate(() => {
    return getSelection()?.getRangeAt(0).endOffset;
  });
  expect(preOffset).toBe(offset);
});

test('readonly mode', async ({ page }) => {
  await enterInlineEditorPlayground(page);
  await focusInlineRichText(page);

  const editorA = page.locator('[data-v-root="true"]').nth(0);
  const editorB = page.locator('[data-v-root="true"]').nth(1);

  await expect(editorA).toHaveText(ZERO_WIDTH_FOR_EMPTY_LINE);
  await expect(editorB).toHaveText(ZERO_WIDTH_FOR_EMPTY_LINE);

  await page.waitForTimeout(100);

  await type(page, 'abcdefg');

  await expect(editorA).toHaveText('abcdefg');
  await expect(editorB).toHaveText('abcdefg');

  await page.evaluate(() => {
    const richTextA = document
      .querySelector('test-page')
      ?.querySelector('test-rich-text');

    if (!richTextA) {
      throw new Error('Cannot find editor');
    }

    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    (richTextA as any).inlineEditor.setReadonly(true);
  });

  await type(page, 'aaaa');

  await expect(editorA).toHaveText('abcdefg');
  await expect(editorB).toHaveText('abcdefg');
});

test('basic styles', async ({ page }) => {
  await enterInlineEditorPlayground(page);
  await focusInlineRichText(page);

  const editorA = page.locator('[data-v-root="true"]').nth(0);
  const editorB = page.locator('[data-v-root="true"]').nth(1);

  const editorABold = page.getByText('bold').nth(0);
  const editorAItalic = page.getByText('italic').nth(0);
  const editorAUnderline = page.getByText('underline').nth(0);
  const editorAStrike = page.getByText('strike').nth(0);
  const editorACode = page.getByText('code').nth(0);

  const editorAUndo = page.getByText('undo').nth(0);
  const editorARedo = page.getByText('redo').nth(0);

  await expect(editorA).toHaveText(ZERO_WIDTH_FOR_EMPTY_LINE);
  await expect(editorB).toHaveText(ZERO_WIDTH_FOR_EMPTY_LINE);

  await page.waitForTimeout(100);

  await type(page, 'abcdefg');

  await expect(editorA).toHaveText('abcdefg');
  await expect(editorB).toHaveText('abcdefg');

  let delta = await getDeltaFromInlineRichText(page);
  await expect(delta).toEqual([
    {
      insert: 'abcdefg',
    },
  ]);

  await setInlineRichTextRange(page, { index: 2, length: 3 });

  await editorABold.click();
  await page.waitForTimeout(100);
  delta = await getDeltaFromInlineRichText(page);
  expect(delta).toEqual([
    {
      insert: 'ab',
    },
    {
      insert: 'cde',
      attributes: {
        bold: true,
      },
    },
    {
      insert: 'fg',
    },
  ]);

  await editorAItalic.click();
  await page.waitForTimeout(100);
  delta = await getDeltaFromInlineRichText(page);
  expect(delta).toEqual([
    {
      insert: 'ab',
    },
    {
      insert: 'cde',
      attributes: {
        bold: true,
        italic: true,
      },
    },
    {
      insert: 'fg',
    },
  ]);

  await editorAUnderline.click();
  await page.waitForTimeout(100);
  delta = await getDeltaFromInlineRichText(page);
  expect(delta).toEqual([
    {
      insert: 'ab',
    },
    {
      insert: 'cde',
      attributes: {
        bold: true,
        italic: true,
        underline: true,
      },
    },
    {
      insert: 'fg',
    },
  ]);

  await editorAStrike.click();
  await page.waitForTimeout(100);
  delta = await getDeltaFromInlineRichText(page);
  expect(delta).toEqual([
    {
      insert: 'ab',
    },
    {
      insert: 'cde',
      attributes: {
        bold: true,
        italic: true,
        underline: true,
        strike: true,
      },
    },
    {
      insert: 'fg',
    },
  ]);

  await editorACode.click();
  await page.waitForTimeout(100);
  delta = await getDeltaFromInlineRichText(page);
  expect(delta).toEqual([
    {
      insert: 'ab',
    },
    {
      insert: 'cde',
      attributes: {
        bold: true,
        italic: true,
        underline: true,
        strike: true,
        code: true,
      },
    },
    {
      insert: 'fg',
    },
  ]);

  await editorAUndo.click({
    clickCount: 5,
  });
  await page.waitForTimeout(100);
  delta = await getDeltaFromInlineRichText(page);
  expect(delta).toEqual([
    {
      insert: 'abcdefg',
    },
  ]);

  await editorARedo.click({
    clickCount: 5,
  });
  await page.waitForTimeout(100);
  delta = await getDeltaFromInlineRichText(page);
  expect(delta).toEqual([
    {
      insert: 'ab',
    },
    {
      insert: 'cde',
      attributes: {
        bold: true,
        italic: true,
        underline: true,
        strike: true,
        code: true,
      },
    },
    {
      insert: 'fg',
    },
  ]);

  await editorABold.click();
  await page.waitForTimeout(100);
  delta = await getDeltaFromInlineRichText(page);
  expect(delta).toEqual([
    {
      insert: 'ab',
    },
    {
      insert: 'cde',
      attributes: {
        italic: true,
        underline: true,
        strike: true,
        code: true,
      },
    },
    {
      insert: 'fg',
    },
  ]);

  await editorAItalic.click();
  await page.waitForTimeout(100);
  delta = await getDeltaFromInlineRichText(page);
  expect(delta).toEqual([
    {
      insert: 'ab',
    },
    {
      insert: 'cde',
      attributes: {
        underline: true,
        strike: true,
        code: true,
      },
    },
    {
      insert: 'fg',
    },
  ]);

  await editorAUnderline.click();
  await page.waitForTimeout(100);
  delta = await getDeltaFromInlineRichText(page);
  expect(delta).toEqual([
    {
      insert: 'ab',
    },
    {
      insert: 'cde',
      attributes: {
        strike: true,
        code: true,
      },
    },
    {
      insert: 'fg',
    },
  ]);

  await editorAStrike.click();
  await page.waitForTimeout(100);
  delta = await getDeltaFromInlineRichText(page);
  expect(delta).toEqual([
    {
      insert: 'ab',
    },
    {
      insert: 'cde',
      attributes: {
        code: true,
      },
    },
    {
      insert: 'fg',
    },
  ]);

  await editorACode.click();
  await page.waitForTimeout(100);
  delta = await getDeltaFromInlineRichText(page);
  expect(delta).toEqual([
    {
      insert: 'abcdefg',
    },
  ]);
});

test('overlapping styles', async ({ page }) => {
  await enterInlineEditorPlayground(page);
  await focusInlineRichText(page);

  const editorA = page.locator('[data-v-root="true"]').nth(0);
  const editorB = page.locator('[data-v-root="true"]').nth(1);

  const editorABold = page.getByText('bold').nth(0);
  const editorAItalic = page.getByText('italic').nth(0);

  const editorAUndo = page.getByText('undo').nth(0);
  const editorARedo = page.getByText('redo').nth(0);

  await expect(editorA).toHaveText(ZERO_WIDTH_FOR_EMPTY_LINE);
  await expect(editorB).toHaveText(ZERO_WIDTH_FOR_EMPTY_LINE);

  await page.waitForTimeout(100);

  await type(page, 'abcdefghijk');

  await expect(editorA).toHaveText('abcdefghijk');
  await expect(editorB).toHaveText('abcdefghijk');

  let delta = await getDeltaFromInlineRichText(page);
  expect(delta).toEqual([
    {
      insert: 'abcdefghijk',
    },
  ]);

  await setInlineRichTextRange(page, { index: 1, length: 3 });
  await editorABold.click();

  delta = await getDeltaFromInlineRichText(page);
  expect(delta).toEqual([
    {
      insert: 'a',
    },
    {
      insert: 'bcd',
      attributes: {
        bold: true,
      },
    },
    {
      insert: 'efghijk',
    },
  ]);

  await setInlineRichTextRange(page, { index: 7, length: 3 });
  await editorABold.click();

  delta = await getDeltaFromInlineRichText(page);
  expect(delta).toEqual([
    {
      insert: 'a',
    },
    {
      insert: 'bcd',
      attributes: {
        bold: true,
      },
    },
    {
      insert: 'efg',
    },
    {
      insert: 'hij',
      attributes: {
        bold: true,
      },
    },
    {
      insert: 'k',
    },
  ]);

  await setInlineRichTextRange(page, { index: 3, length: 5 });
  await editorAItalic.click();

  delta = await getDeltaFromInlineRichText(page);
  expect(delta).toEqual([
    {
      insert: 'a',
    },
    {
      insert: 'bc',
      attributes: {
        bold: true,
      },
    },
    {
      insert: 'd',
      attributes: {
        bold: true,
        italic: true,
      },
    },
    {
      insert: 'efg',
      attributes: {
        italic: true,
      },
    },
    {
      insert: 'h',
      attributes: {
        bold: true,
        italic: true,
      },
    },
    {
      insert: 'ij',
      attributes: {
        bold: true,
      },
    },
    {
      insert: 'k',
    },
  ]);

  await editorAUndo.click({
    clickCount: 3,
  });
  delta = await getDeltaFromInlineRichText(page);
  expect(delta).toEqual([
    {
      insert: 'abcdefghijk',
    },
  ]);

  await editorARedo.click({
    clickCount: 3,
  });
  delta = await getDeltaFromInlineRichText(page);
  expect(delta).toEqual([
    {
      insert: 'a',
    },
    {
      insert: 'bc',
      attributes: {
        bold: true,
      },
    },
    {
      insert: 'd',
      attributes: {
        bold: true,
        italic: true,
      },
    },
    {
      insert: 'efg',
      attributes: {
        italic: true,
      },
    },
    {
      insert: 'h',
      attributes: {
        bold: true,
        italic: true,
      },
    },
    {
      insert: 'ij',
      attributes: {
        bold: true,
      },
    },
    {
      insert: 'k',
    },
  ]);
});

test('input continuous spaces', async ({ page }) => {
  await enterInlineEditorPlayground(page);
  await focusInlineRichText(page);

  const editorA = page.locator('[data-v-root="true"]').nth(0);
  const editorB = page.locator('[data-v-root="true"]').nth(1);

  await expect(editorA).toHaveText(ZERO_WIDTH_FOR_EMPTY_LINE);
  await expect(editorB).toHaveText(ZERO_WIDTH_FOR_EMPTY_LINE);

  await page.waitForTimeout(100);

  await type(page, 'abc   def');

  await expect(editorA).toHaveText('abc   def');
  await expect(editorB).toHaveText('abc   def');

  await focusInlineRichText(page);
  await page.waitForTimeout(100);
  await press(page, 'ArrowLeft');
  await press(page, 'ArrowLeft');
  await press(page, 'ArrowLeft');
  await press(page, 'ArrowLeft');

  await press(page, 'Enter');

  await expect(editorA).toHaveText('abc  \n' + ' def', {
    useInnerText: true, // for multi-line text
  });
  await expect(editorB).toHaveText('abc  \n' + ' def', {
    useInnerText: true, // for multi-line text
  });
});

test('select from the start of line using shift+arrow', async ({ page }) => {
  await enterInlineEditorPlayground(page);
  await focusInlineRichText(page);

  const editorA = page.locator('[data-v-root="true"]').nth(0);
  const editorB = page.locator('[data-v-root="true"]').nth(1);

  await expect(editorA).toHaveText(ZERO_WIDTH_FOR_EMPTY_LINE);
  await expect(editorB).toHaveText(ZERO_WIDTH_FOR_EMPTY_LINE);

  await page.waitForTimeout(100);

  await type(page, 'abc');
  await press(page, 'Enter');
  await type(page, 'def');
  await press(page, 'Enter');
  await type(page, 'ghi');

  await expect(editorB).toHaveText('abc\ndef\nghi', {
    useInnerText: true, // for multi-line text
  });
  await expect(editorA).toHaveText('abc\ndef\nghi', {
    useInnerText: true, // for multi-line text
  });

  /**
   * abc
   * def
   * |ghi
   */
  await press(page, 'ArrowLeft');
  await press(page, 'ArrowLeft');
  await press(page, 'ArrowLeft');
  await assertSelection(page, 0, 8);

  /**
   * |abc
   * def
   * |ghi
   */
  await page.keyboard.down('Shift');
  await press(page, 'ArrowUp');
  await press(page, 'ArrowUp');
  await assertSelection(page, 0, 0, 8);

  /**
   * a|bc
   * def
   * |ghi
   */
  await press(page, 'ArrowRight');
  await assertSelection(page, 0, 1, 7);
  await pressBackspace(page);
  await page.waitForTimeout(100);

  await expect(editorA).toHaveText('aghi');
  await expect(editorB).toHaveText('aghi');
});

test('getLine', async ({ page }) => {
  await enterInlineEditorPlayground(page);
  await focusInlineRichText(page);

  const editorA = page.locator('[data-v-root="true"]').nth(0);
  const editorB = page.locator('[data-v-root="true"]').nth(1);

  await expect(editorA).toHaveText(ZERO_WIDTH_FOR_EMPTY_LINE);
  await expect(editorB).toHaveText(ZERO_WIDTH_FOR_EMPTY_LINE);

  await page.waitForTimeout(100);

  await type(page, 'abc\ndef\nghi');

  await expect(editorA).toHaveText('abc\ndef\nghi', {
    useInnerText: true, // for multi-line text
  });
  await expect(editorB).toHaveText('abc\ndef\nghi', {
    useInnerText: true, // for multi-line text
  });

  const [line1, offset1] = await getInlineRichTextLine(page, 0);
  const [line2, offset2] = await getInlineRichTextLine(page, 1);
  const [line3, offset3] = await getInlineRichTextLine(page, 4);
  const [line4, offset4] = await getInlineRichTextLine(page, 5);
  const [line5, offset5] = await getInlineRichTextLine(page, 8);
  const [line6, offset6] = await getInlineRichTextLine(page, 11);

  expect(line1).toEqual('abc');
  expect(offset1).toEqual(0);
  expect(line2).toEqual('abc');
  expect(offset2).toEqual(1);
  expect(line3).toEqual('def');
  expect(offset3).toEqual(0);
  expect(line4).toEqual('def');
  expect(offset4).toEqual(1);
  expect(line5).toEqual('ghi');
  expect(offset5).toEqual(0);
  expect(line6).toEqual('ghi');
  expect(offset6).toEqual(3);
});

test('yText should not contain \r', async ({ page }) => {
  await enterInlineEditorPlayground(page);
  await focusInlineRichText(page);

  await page.waitForTimeout(100);
  const message = await page.evaluate(() => {
    const richText = document
      .querySelector('test-page')
      ?.querySelector('test-rich-text');

    if (!richText) {
      throw new Error('Cannot find test-rich-text');
    }

    // oxlint-disable-next-line @typescript-eslint/no-explicit-any
    const editor = (richText as any).inlineEditor as InlineEditor;

    try {
      editor.insertText({ index: 0, length: 0 }, 'abc\r');
    } catch (e) {
      // oxlint-disable-next-line @typescript-eslint/no-explicit-any
      return (e as any).message;
    }
  });

  expect(message).toBe(
    'yText must not contain "\\r" because it will break the range synchronization'
  );
});

test('embed', async ({ page }) => {
  await enterInlineEditorPlayground(page);
  await focusInlineRichText(page);

  const editorA = page.locator('[data-v-root="true"]').nth(0);
  const editorAEmbed = page.getByText('embed').nth(0);
  await expect(editorA).toHaveText(ZERO_WIDTH_FOR_EMPTY_LINE);

  await page.waitForTimeout(100);

  await type(page, 'abcde');

  await expect(editorA).toHaveText('abcde');

  await press(page, 'ArrowLeft');
  await page.waitForTimeout(100);
  await page.keyboard.down('Shift');
  await press(page, 'ArrowLeft');
  await press(page, 'ArrowLeft');
  await press(page, 'ArrowLeft');
  await page.keyboard.up('Shift');
  await page.waitForTimeout(100);
  await assertSelection(page, 0, 1, 3);

  await editorAEmbed.click();
  const embedCount = await page.locator('[data-v-embed="true"]').count();
  await expect(embedCount).toBe(3);

  // try to update cursor position using arrow keys
  await assertSelection(page, 0, 1, 3);
  await press(page, 'ArrowLeft');
  await assertSelection(page, 0, 1, 0);
  await press(page, 'ArrowLeft');
  await assertSelection(page, 0, 0, 0);
  await press(page, 'ArrowRight');
  await assertSelection(page, 0, 1, 0);
  await press(page, 'ArrowRight');
  await assertSelection(page, 0, 1, 1);
  await press(page, 'ArrowRight');
  await assertSelection(page, 0, 2, 0);
  await press(page, 'ArrowRight');
  await assertSelection(page, 0, 2, 1);
  await press(page, 'ArrowRight');
  await assertSelection(page, 0, 3, 0);
  await press(page, 'ArrowRight');
  await assertSelection(page, 0, 3, 1);
  await press(page, 'ArrowRight');
  await assertSelection(page, 0, 4, 0);
  await press(page, 'ArrowRight');
  await assertSelection(page, 0, 5, 0);
  await press(page, 'ArrowLeft');
  await assertSelection(page, 0, 4, 0);
  await press(page, 'ArrowLeft');
  await assertSelection(page, 0, 3, 1);

  // try to update cursor position and select embed element by clicking embed element
  let rect = await getInlineRangeIndexRect(page, [0, 1]);
  await page.mouse.click(rect.x + 3, rect.y);
  await assertSelection(page, 0, 1, 1);

  rect = await getInlineRangeIndexRect(page, [0, 2]);
  await page.mouse.click(rect.x + 3, rect.y);
  await assertSelection(page, 0, 2, 1);

  rect = await getInlineRangeIndexRect(page, [0, 3]);
  await page.mouse.click(rect.x + 3, rect.y);
  await assertSelection(page, 0, 3, 1);
});

test('delete embed when pressing backspace after embed', async ({ page }) => {
  await enterInlineEditorPlayground(page);
  await focusInlineRichText(page);

  const editorA = page.locator('[data-v-root="true"]').nth(0);
  const editorAEmbed = page.getByText('embed').nth(0);
  await expect(editorA).toHaveText(ZERO_WIDTH_FOR_EMPTY_LINE);
  await page.waitForTimeout(100);
  await type(page, 'ab');
  await expect(editorA).toHaveText('ab');

  await page.keyboard.down('Shift');
  await press(page, 'ArrowLeft');
  await page.keyboard.up('Shift');
  await page.waitForTimeout(100);
  await assertSelection(page, 0, 1, 1);
  await editorAEmbed.click();

  let delta = await getDeltaFromInlineRichText(page);
  expect(delta).toEqual([
    {
      insert: 'a',
    },
    {
      insert: 'b',
      attributes: {
        embed: true,
      },
    },
  ]);

  const rect = await getInlineRangeIndexRect(page, [0, 2]);
  // use click to select right side of the embed instead of use arrow key
  await page.mouse.click(rect.x + 3, rect.y);
  await assertSelection(page, 0, 2, 0);
  await pressBackspace(page);

  delta = await getDeltaFromInlineRichText(page);
  expect(delta).toEqual([
    {
      insert: 'a',
    },
  ]);
});

test('triple click to select line', async ({ page }) => {
  await enterInlineEditorPlayground(page);
  await focusInlineRichText(page);

  const editorA = page.locator('[data-v-root="true"]').nth(0);

  await expect(editorA).toHaveText(ZERO_WIDTH_FOR_EMPTY_LINE);
  await page.waitForTimeout(100);
  await type(page, 'abc\nabc abc abc\nabc');

  await expect(editorA).toHaveText('abc\nabc abc abc\nabc', {
    useInnerText: true, // for multi-line text
  });

  const rect = await getInlineRangeIndexRect(page, [0, 10]);
  await page.mouse.click(rect.x, rect.y, {
    clickCount: 3,
  });
  await assertSelection(page, 0, 4, 11);

  await pressBackspace(page);
  await expect(editorA).toHaveText(
    'abc\n' + ZERO_WIDTH_FOR_EMPTY_LINE + '\nabc',
    {
      useInnerText: true, // for multi-line text
    }
  );
});

test('caret should move correctly when inline elements are exist', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page, 0);

  // hello 'link doc' world
  await type(page, 'hello ');
  await press(page, '@');
  await type(page, 'link doc');
  await pressEnter(page);
  await type(page, ' world');

  await pressArrowLeft(page, ' world'.length);
  await pressArrowLeft(page); // on 'linked doc'
  await pressArrowLeft(page); // on the left side of 'linked doc'
  await type(page, 'test');

  await assertRichTextInlineDeltas(page, [
    {
      insert: 'hello test',
    },
    {
      attributes: {
        reference: {
          pageId: '3',
          type: 'LinkedPage',
        },
      },
      insert: ' ',
    },
    {
      insert: ' world',
    },
  ]);
});
