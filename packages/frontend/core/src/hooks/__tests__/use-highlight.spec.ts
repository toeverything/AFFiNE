import { describe, expect, test } from 'vitest';

import { highlightTextFragments } from '../affine/use-highlight';

describe('highlightTextFragments', () => {
  test('should correctly highlight full matches', () => {
    const highlights = highlightTextFragments('This is a test', 'is');
    expect(highlights).toStrictEqual([
      { text: 'Th', highlight: false },
      { text: 'is', highlight: true },
      { text: ' is a test', highlight: false },
    ]);
  });

  test('highlight with space', () => {
    const result = highlightTextFragments('Hello World', 'lo w');
    expect(result).toEqual([
      { text: 'Hel', highlight: false },
      { text: 'lo W', highlight: true },
      { text: 'orld', highlight: false },
    ]);
  });

  test('should correctly perform partial matching', () => {
    const highlights = highlightTextFragments('Hello World', 'hw');
    expect(highlights).toStrictEqual([
      { text: 'H', highlight: true },
      { text: 'ello ', highlight: false },
      { text: 'W', highlight: true },
      { text: 'orld', highlight: false },
    ]);
  });
});
