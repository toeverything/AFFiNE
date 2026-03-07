import { describe, expect, it } from 'vitest';

import { obsidianCommentDeltaToMarkdownAdapterMatcher } from '../adapters/markdown/inline-delta';
import { CommentMarkdown } from '../markdown';

// Extract the pattern from the extension config.
const commentPattern = (CommentMarkdown as unknown as { pattern: RegExp })
  .pattern;

describe('CommentMarkdown', () => {
  describe('pattern matching', () => {
    it('should match %%word%% followed by space', () => {
      expect('%%hidden%% ').toMatch(commentPattern);
    });

    it('should match %%multi word%% followed by space', () => {
      expect('%%this is a comment%% ').toMatch(commentPattern);
    });

    it('should match single-char %%x%% followed by space', () => {
      expect('%%x%% ').toMatch(commentPattern);
    });

    it('should match with prefix text before %%', () => {
      expect('some text %%private note%% ').toMatch(commentPattern);
    });

    it('should NOT match %% with leading space inside delimiters', () => {
      expect('%% hidden%% ').not.toMatch(commentPattern);
    });

    it('should NOT match %% with trailing space inside delimiters', () => {
      expect('%%hidden %% ').not.toMatch(commentPattern);
    });

    it('should NOT match %% with spaces on both sides inside delimiters', () => {
      expect('%% hidden %% ').not.toMatch(commentPattern);
    });

    it('should NOT match without trailing space trigger', () => {
      expect('%%hidden%%').not.toMatch(commentPattern);
    });

    it('should NOT match an empty %%%%', () => {
      expect('%%%%').not.toMatch(commentPattern);
      expect('%%%% ').not.toMatch(commentPattern);
    });
  });

  describe('captured text', () => {
    it('should capture inner text correctly (single word)', () => {
      const match = '%%secret%% '.match(commentPattern);
      expect(match).not.toBeNull();
      const captured = match![1] ?? match![2];
      expect(captured).toBe('secret');
    });

    it('should capture multi-word inner text', () => {
      const match = '%%this is private%% '.match(commentPattern);
      expect(match).not.toBeNull();
      const captured = match![1] ?? match![2];
      expect(captured).toBe('this is private');
    });
  });
});

describe('obsidianCommentDeltaToMarkdownAdapterMatcher', () => {
  const matcher = obsidianCommentDeltaToMarkdownAdapterMatcher as unknown as {
    name: string;
    match: (delta: {
      insert: string;
      attributes?: Record<string, unknown>;
    }) => boolean;
    toAST: (delta: {
      insert: string;
      attributes?: Record<string, unknown>;
    }) => { type: string; value: string };
  };

  it('matches deltas with obsidianComment attribute', () => {
    expect(
      matcher.match({ insert: 'hidden', attributes: { obsidianComment: true } })
    ).toBe(true);
  });

  it('does not match deltas without obsidianComment', () => {
    expect(
      matcher.match({ insert: 'visible', attributes: { bold: true } })
    ).toBe(false);
  });

  it('serialises single-line comment as %%text%%', () => {
    const result = matcher.toAST({
      insert: 'private note',
      attributes: { obsidianComment: true },
    });
    expect(result).toEqual({ type: 'text', value: '%%private note%%' });
  });

  it('serialises multi-line comment as %%\\ntext\\n%%', () => {
    const result = matcher.toAST({
      insert: 'line one\nline two',
      attributes: { obsidianComment: true },
    });
    expect(result).toEqual({
      type: 'text',
      value: '%%\nline one\nline two\n%%',
    });
  });
});
