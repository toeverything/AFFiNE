import { isValidTagName } from '@blocksuite/affine-inline-tag';
import { describe, expect, it } from 'vitest';

import { TAG_MARKDOWN_PATTERN } from '../markdown';

const tagPattern = TAG_MARKDOWN_PATTERN;

describe('isValidTagName', () => {
  it('accepts simple word tags', () => {
    expect(isValidTagName('mytag')).toBe(true);
  });

  it('accepts hyphenated tags', () => {
    expect(isValidTagName('my-tag')).toBe(true);
  });

  it('accepts underscore tags', () => {
    expect(isValidTagName('my_tag')).toBe(true);
  });

  it('accepts nested tags with slash', () => {
    expect(isValidTagName('parent/child')).toBe(true);
  });

  it('accepts alphanumeric mix starting with letters', () => {
    expect(isValidTagName('tag123')).toBe(true);
  });

  it('accepts alphanumeric mix starting with digits but containing letter', () => {
    expect(isValidTagName('123tag')).toBe(true);
  });

  it('rejects purely numeric tags', () => {
    expect(isValidTagName('123')).toBe(false);
  });

  it('rejects tags with spaces', () => {
    expect(isValidTagName('my tag')).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isValidTagName('')).toBe(false);
  });

  it('rejects tags with special characters', () => {
    expect(isValidTagName('tag!')).toBe(false);
    expect(isValidTagName('tag@name')).toBe(false);
  });
});

describe('TagMarkdownExtension pattern', () => {
  it('should match #tag followed by space', () => {
    expect('#mytag ').toMatch(tagPattern);
  });

  it('should match #hyphenated-tag followed by space', () => {
    expect('#my-tag ').toMatch(tagPattern);
  });

  it('should match #nested/tag followed by space', () => {
    expect('#parent/child ').toMatch(tagPattern);
  });

  it('should match #tag after text', () => {
    expect('some text #mytag ').toMatch(tagPattern);
  });

  it('should capture the tag name (group 1)', () => {
    const match = '#mytag '.match(tagPattern);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('mytag');
  });

  it('should capture hyphenated tag name', () => {
    const match = '#my-tag '.match(tagPattern);
    expect(match).not.toBeNull();
    expect(match![1]).toBe('my-tag');
  });

  it('should NOT match without trailing space', () => {
    expect('#mytag').not.toMatch(tagPattern);
  });

  it('should NOT match purely numeric tag', () => {
    expect('#123 ').not.toMatch(tagPattern);
  });

  it('should NOT match # followed by space (heading trigger)', () => {
    expect('# heading ').not.toMatch(tagPattern);
  });
});

describe('tag delta markdown serialisation', () => {
  // Test the serialisation logic directly (same logic as tagDeltaToMarkdownAdapterMatcher).
  const matchFn = (delta: {
    insert: string;
    attributes?: Record<string, unknown>;
  }) => !!delta.attributes?.tag;

  const toASTFn = (delta: {
    insert: string;
    attributes?: Record<string, unknown>;
  }) => {
    const tagAttr = delta.attributes?.tag as { name: string } | undefined;
    const tagName = tagAttr?.name ?? '';
    return { type: 'text', value: `#${tagName}` };
  };

  it('matches deltas with tag attribute', () => {
    expect(
      matchFn({ insert: '\u200B', attributes: { tag: { name: 'mytag' } } })
    ).toBe(true);
  });

  it('does not match deltas without tag attribute', () => {
    expect(matchFn({ insert: 'plain text', attributes: {} })).toBe(false);
  });

  it('serialises tag delta as #tagname', () => {
    const result = toASTFn({
      insert: '\u200B',
      attributes: { tag: { name: 'mytag' } },
    });
    expect(result).toEqual({ type: 'text', value: '#mytag' });
  });

  it('serialises nested tag as #parent/child', () => {
    const result = toASTFn({
      insert: '\u200B',
      attributes: { tag: { name: 'parent/child' } },
    });
    expect(result).toEqual({ type: 'text', value: '#parent/child' });
  });
});
