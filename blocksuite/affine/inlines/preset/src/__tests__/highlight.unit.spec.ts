import { describe, expect, it } from 'vitest';

import { DEFAULT_HIGHLIGHT_COLOR, HighlightMarkdown } from '../markdown';

// Extract the pattern from the extension config for direct testing.
// The InlineMarkdownExtension config is a plain object with a `pattern` field.
const highlightPattern = (HighlightMarkdown as unknown as { pattern: RegExp })
  .pattern;

describe('HighlightMarkdown', () => {
  describe('pattern matching', () => {
    it('should match ==word== followed by space', () => {
      expect('==hello== ').toMatch(highlightPattern);
    });

    it('should match ==multi word== followed by space', () => {
      expect('==hello world== ').toMatch(highlightPattern);
    });

    it('should match single-char ==x== followed by space', () => {
      expect('==x== ').toMatch(highlightPattern);
    });

    it('should match with prefix text before ==', () => {
      expect('some text ==highlighted== ').toMatch(highlightPattern);
    });

    it('should NOT match == with leading space inside delimiters', () => {
      expect('== hello== ').not.toMatch(highlightPattern);
    });

    it('should NOT match == with trailing space inside delimiters', () => {
      expect('==hello == ').not.toMatch(highlightPattern);
    });

    it('should NOT match == with spaces on both sides inside delimiters', () => {
      expect('== hello == ').not.toMatch(highlightPattern);
    });

    it('should NOT match without trailing space trigger', () => {
      expect('==hello==').not.toMatch(highlightPattern);
    });

    it('should NOT match an empty == ==', () => {
      expect('====').not.toMatch(highlightPattern);
      expect('==== ').not.toMatch(highlightPattern);
    });
  });

  describe('captured text', () => {
    it('should capture the inner text correctly (single word)', () => {
      const match = '==hello== '.match(highlightPattern);
      expect(match).not.toBeNull();
      const captured = match![1] ?? match![2];
      expect(captured).toBe('hello');
    });

    it('should capture multi-word inner text', () => {
      const match = '==hello world== '.match(highlightPattern);
      expect(match).not.toBeNull();
      const captured = match![1] ?? match![2];
      expect(captured).toBe('hello world');
    });

    it('should capture single char', () => {
      const match = '==x== '.match(highlightPattern);
      expect(match).not.toBeNull();
      const captured = match![1] ?? match![2];
      expect(captured).toBe('x');
    });
  });

  describe('DEFAULT_HIGHLIGHT_COLOR constant', () => {
    it('should be a CSS variable token', () => {
      expect(DEFAULT_HIGHLIGHT_COLOR).toMatch(/^var\(--/);
    });

    it('should use affine-highlight-yellow token', () => {
      expect(DEFAULT_HIGHLIGHT_COLOR).toBe('var(--affine-highlight-yellow)');
    });
  });
});
