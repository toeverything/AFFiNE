import type { DeltaInsert } from '@blocksuite/store';
import { expect, type Page } from '@playwright/test';

import type { InlineEditor, InlineRange } from '../../inline/index.js';

const defaultPlaygroundURL = new URL(
  `http://localhost:${process.env.CI ? 4173 : 5173}/`
);

export async function type(page: Page, content: string) {
  await page.keyboard.type(content, { delay: 50 });
}

export async function press(page: Page, content: string) {
  await page.keyboard.press(content, { delay: 50 });
  await page.waitForTimeout(50);
}

export async function enterInlineEditorPlayground(page: Page) {
  const url = new URL('examples/inline/index.html', defaultPlaygroundURL);
  await page.goto(url.toString());
}

export async function focusInlineRichText(
  page: Page,
  index = 0
): Promise<void> {
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

export async function getDeltaFromInlineRichText(
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

export async function getInlineRangeFromInlineRichText(
  page: Page,
  index = 0
): Promise<InlineRange | null> {
  await page.waitForTimeout(100);
  return page.evaluate(index => {
    const richTexts = document
      .querySelector('test-page')
      ?.querySelectorAll('test-rich-text');

    if (!richTexts) {
      throw new Error('Cannot find test-rich-text');
    }

    const editor = (richTexts[index] as any).inlineEditor as InlineEditor;
    return editor.getInlineRange();
  }, index);
}

export async function setInlineRichTextRange(
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

export async function getInlineRichTextLine(
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

export async function getInlineRangeIndexRect(
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

export async function assertSelection(
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
