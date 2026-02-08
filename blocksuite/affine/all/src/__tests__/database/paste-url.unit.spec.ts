import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import { describe, expect, test } from 'vitest';

import { insertUrlTextSegments } from '../../../../blocks/database/src/properties/paste-url.js';

type InsertCall = {
  range: {
    index: number;
    length: number;
  };
  text: string;
  attributes?: AffineTextAttributes;
};

describe('insertUrlTextSegments', () => {
  test('should replace selected text on first insert and append remaining segments', () => {
    const insertCalls: InsertCall[] = [];
    const selectionCalls: Array<{ index: number; length: number } | null> = [];
    const inlineEditor = {
      insertText: (
        range: { index: number; length: number },
        text: string,
        attributes?: AffineTextAttributes
      ) => {
        insertCalls.push({ range, text, attributes });
      },
      setInlineRange: (range: { index: number; length: number } | null) => {
        selectionCalls.push(range);
      },
    };

    const inlineRange = { index: 4, length: 6 };
    const segments = [
      { text: 'hi - ' },
      { text: 'https://google.com', link: 'https://google.com' },
    ];

    insertUrlTextSegments(inlineEditor, inlineRange, segments);

    expect(insertCalls).toEqual([
      {
        range: { index: 4, length: 6 },
        text: 'hi - ',
      },
      {
        range: { index: 9, length: 0 },
        text: 'https://google.com',
        attributes: {
          link: 'https://google.com',
        },
      },
    ]);
    expect(selectionCalls).toEqual([{ index: 27, length: 0 }]);
  });

  test('should keep insertion range length zero when there is no selected text', () => {
    const insertCalls: InsertCall[] = [];
    const selectionCalls: Array<{ index: number; length: number } | null> = [];
    const inlineEditor = {
      insertText: (
        range: { index: number; length: number },
        text: string,
        attributes?: AffineTextAttributes
      ) => {
        insertCalls.push({ range, text, attributes });
      },
      setInlineRange: (range: { index: number; length: number } | null) => {
        selectionCalls.push(range);
      },
    };

    const inlineRange = { index: 2, length: 0 };
    const segments = [
      { text: 'prefix ' },
      { text: 'https://a.com', link: 'https://a.com' },
    ];

    insertUrlTextSegments(inlineEditor, inlineRange, segments);

    expect(insertCalls).toEqual([
      {
        range: { index: 2, length: 0 },
        text: 'prefix ',
      },
      {
        range: { index: 9, length: 0 },
        text: 'https://a.com',
        attributes: {
          link: 'https://a.com',
        },
      },
    ]);
    expect(selectionCalls).toEqual([{ index: 22, length: 0 }]);
  });
});
