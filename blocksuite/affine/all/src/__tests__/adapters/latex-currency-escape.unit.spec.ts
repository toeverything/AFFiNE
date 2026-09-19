import { preprocessLatex } from '@blocksuite/affine-block-latex';
import { describe, expect, test } from 'vitest';

describe('latex preprocessor currency escaping', () => {
  test.each([
    ['a plain price', 'costs $5 today', 'costs \\$5 today'],
    ['a bare amount', '$4', '\\$4'],
    ['two prices', 'costs $5 and $10', 'costs \\$5 and \\$10'],
  ])('escapes %s', (_, markdown, expected) => {
    expect(preprocessLatex(markdown)).toBe(expected);
  });

  describe('a dollar that is already escaped', () => {
    // Escaping it again turns the odd backslash run even, which leaves a
    // literal backslash followed by an unescaped `$` for remark-math.
    test.each([
      ['one backslash', 'costs \\$4 today'],
      ['three backslashes', '\\\\\\$4'],
      ['several amounts', '\\$4 and \\$10'],
    ])('is left alone with %s', (_, markdown) => {
      expect(preprocessLatex(markdown)).toBe(markdown);
    });
  });

  test('an even backslash run still has its dollar escaped', () => {
    // `\\` is a literal backslash, so the `$` after it is unescaped and is a
    // genuine currency candidate. The run itself must survive untouched.
    expect(preprocessLatex('costs \\\\$4 today')).toBe('costs \\\\\\$4 today');
  });
});
