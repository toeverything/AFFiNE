import { preprocessLatex } from '@blocksuite/affine-block-latex';
import { describe, expect, test } from 'vitest';

describe('latex markdown preprocessor', () => {
  describe('inline math starting with a digit (issue #15588)', () => {
    test.each([
      ['binary operators', '$4\\vee 6=12$'],
      ['relation', '$2<3$'],
      ['single digit', '$5$'],
    ])('leaves %s untouched', (_, markdown) => {
      expect(preprocessLatex(markdown)).toBe(markdown);
    });

    test('keeps every expression in a sentence mixing math and prose', () => {
      const markdown =
        '$(\\mathbb Z^+,|)$ has $4\\vee 6=12$ and $4\\wedge 6=2$.';

      expect(preprocessLatex(markdown)).toBe(markdown);
    });
  });

  describe('currency still escapes', () => {
    test.each([
      [
        'two prices in prose',
        'costs $5 and $10 today',
        'costs \\$5 and \\$10 today',
      ],
      ['a single price', 'it costs $5.00 total', 'it costs \\$5.00 total'],
      ['adjacent amounts', '$100$200', '\\$100\\$200'],
    ])('escapes %s', (_, markdown, expected) => {
      expect(preprocessLatex(markdown)).toBe(expected);
    });
  });

  describe('escaped dollars are not delimiters', () => {
    test('an escaped dollar does not close inline math', () => {
      expect(preprocessLatex('$5\\$ and $10')).toBe('\\$5\\$ and \\$10');
    });

    test('an escaped dollar does not open inline math', () => {
      expect(preprocessLatex('\\$5 and x$')).toBe('\\\\$5 and x$');
    });

    test('an even backslash run is a literal backslash, not an escape', () => {
      expect(preprocessLatex('\\\\$4\\vee 6=12$')).toBe('\\\\$4\\vee 6=12$');
    });

    test('a literal dollar inside math is kept', () => {
      expect(preprocessLatex('$a\\$b$')).toBe('$a\\$b$');
    });
  });

  describe('existing behaviour is unchanged', () => {
    test('display math is left alone', () => {
      expect(preprocessLatex('$$x=1$$')).toBe('$$x=1$$');
    });

    test('a dollar followed by whitespace does not open math', () => {
      expect(preprocessLatex('$ 5 dollars$')).toBe('$ 5 dollars$');
    });

    test('backslash-paren math is rewritten to dollars', () => {
      expect(preprocessLatex('\\(E=mc^2\\)')).toBe('$E=mc^2$');
    });

    test('code spans are protected', () => {
      expect(preprocessLatex('`$4 is not math`')).toBe('`$4 is not math`');
    });
  });
});
