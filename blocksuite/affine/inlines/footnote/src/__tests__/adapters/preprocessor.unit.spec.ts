import { describe, expect, it } from 'vitest';

import { preprocessFootnoteReference } from '../../adapters/markdown/preprocessor';

describe('FootnoteReferenceMarkdownPreprocessorExtension', () => {
  it('should add space before footnote reference when it follows a URL', () => {
    const content = 'https://example.com[^label]';
    const expected = 'https://example.com [^label]';
    expect(preprocessFootnoteReference(content)).toBe(expected);
  });

  it('should add space before footnote reference when URL has text prefix with space', () => {
    const content = 'hello world https://example.com[^label]';
    const expected = 'hello world https://example.com [^label]';
    expect(preprocessFootnoteReference(content)).toBe(expected);
  });

  it('should add space before footnote reference when URL has text prefix with dash', () => {
    const content = 'text-https://example.com[^label]';
    const expected = 'text-https://example.com [^label]';
    expect(preprocessFootnoteReference(content)).toBe(expected);
  });

  it('should not add space when footnote reference follows non-URL text', () => {
    const content = 'normal text[^label]';
    const expected = 'normal text[^label]';
    expect(preprocessFootnoteReference(content)).toBe(expected);
  });

  it('should not add space when there is already a space before footnote reference', () => {
    const content = 'https://example.com [^label]';
    const expected = 'https://example.com [^label]';
    expect(preprocessFootnoteReference(content)).toBe(expected);
  });

  it('should handle multiple footnote references with mixed URL and non-URL text', () => {
    const content = 'https://example.com[^1]normal text[^2]http://test.com[^3]';
    const expected =
      'https://example.com [^1]normal text[^2]http://test.com [^3]';
    expect(preprocessFootnoteReference(content)).toBe(expected);
  });

  it('should not modify footnote definitions', () => {
    const content = '[^label]: This is a footnote definition';
    const expected = '[^label]: This is a footnote definition';
    expect(preprocessFootnoteReference(content)).toBe(expected);
  });

  it('should handle content without footnote references', () => {
    const content = 'This is a normal text without any footnotes';
    const expected = 'This is a normal text without any footnotes';
    expect(preprocessFootnoteReference(content)).toBe(expected);
  });

  it('should handle complex URLs with paths and parameters', () => {
    const content = 'https://example.com/path?param=value[^label]';
    const expected = 'https://example.com/path?param=value [^label]';
    expect(preprocessFootnoteReference(content)).toBe(expected);
  });

  it('should handle invalid URLs', () => {
    const content = 'not-a-url[^label]';
    const expected = 'not-a-url[^label]';
    expect(preprocessFootnoteReference(content)).toBe(expected);
  });
});
