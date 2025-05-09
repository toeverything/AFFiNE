import { describe, expect, it } from 'vitest';

import { footnoteUrlPreprocessor } from '../../adapters/markdown/preprocessor';

describe('footnoteUrlPreprocessor', () => {
  it('should encode unencoded URLs in footnote definitions', () => {
    const input =
      '[^ref]: {"type":"url","url":"https://example.com?param=value"}';
    const expected =
      '[^ref]: {"type":"url","url":"https%3A%2F%2Fexample.com%3Fparam%3Dvalue"}';
    expect(footnoteUrlPreprocessor(input)).toBe(expected);
  });

  it('should not encode already encoded URLs', () => {
    const input = '[^ref]: {"type":"url","url":"https%3A%2F%2Fexample.com"}';
    expect(footnoteUrlPreprocessor(input)).toBe(input);
  });

  it('should handle invalid JSON content', () => {
    const input = '[^ref]: {"invalid json"}';
    expect(footnoteUrlPreprocessor(input)).toBe(input);
  });

  it('should handle non-object footnote data', () => {
    const input = '[^ref]: "not an object"';
    expect(footnoteUrlPreprocessor(input)).toBe(input);
  });

  it('should handle footnote data without url property', () => {
    const input = '[^ref]: {"type":"url"}';
    expect(footnoteUrlPreprocessor(input)).toBe(input);
  });

  it('should handle multiple footnote definitions', () => {
    const input = `
[^ref1]: {"type":"url","url":"https://example1.com"}
[^ref2]: {"type":"url","url":"https://example2.com"}
    `.trim();
    const expected = `
[^ref1]: {"type":"url","url":"https%3A%2F%2Fexample1.com"}
[^ref2]: {"type":"url","url":"https%3A%2F%2Fexample2.com"}
    `.trim();
    expect(footnoteUrlPreprocessor(input)).toBe(expected);
  });

  it('should handle special characters in URLs', () => {
    const input =
      '[^ref]: {"type":"url","url":"https://example.com/path with spaces?param=value&another=param"}';
    const expected =
      '[^ref]: {"type":"url","url":"https%3A%2F%2Fexample.com%2Fpath%20with%20spaces%3Fparam%3Dvalue%26another%3Dparam"}';
    expect(footnoteUrlPreprocessor(input)).toBe(expected);
  });

  it('should encode unencoded favicon URLs', () => {
    const input =
      '[^ref]: {"type":"url","url":"https://example.com","favicon":"https://example.com/icon.png"}';
    const expected =
      '[^ref]: {"type":"url","url":"https%3A%2F%2Fexample.com","favicon":"https%3A%2F%2Fexample.com%2Ficon.png"}';
    expect(footnoteUrlPreprocessor(input)).toBe(expected);
  });

  it('should not encode already encoded favicon URLs', () => {
    const input =
      '[^ref]: {"type":"url","url":"https://example.com","favicon":"https%3A%2F%2Fexample.com%2Ficon.png"}';
    const expected =
      '[^ref]: {"type":"url","url":"https%3A%2F%2Fexample.com","favicon":"https%3A%2F%2Fexample.com%2Ficon.png"}';
    expect(footnoteUrlPreprocessor(input)).toBe(expected);
  });

  it('should handle both URL and icon encoding in the same footnote', () => {
    const input =
      '[^ref]: {"type":"url","url":"https://example.com?param=value","favicon":"https://example.com/icon.png?size=large"}';
    const expected =
      '[^ref]: {"type":"url","url":"https%3A%2F%2Fexample.com%3Fparam%3Dvalue","favicon":"https%3A%2F%2Fexample.com%2Ficon.png%3Fsize%3Dlarge"}';
    expect(footnoteUrlPreprocessor(input)).toBe(expected);
  });

  it('should format footnote definition with space', () => {
    const input =
      '[^ref]:{"type":"url","url":"https://example.com?param=value"}';
    const expected =
      '[^ref]: {"type":"url","url":"https%3A%2F%2Fexample.com%3Fparam%3Dvalue"}';
    expect(footnoteUrlPreprocessor(input)).toBe(expected);
  });

  it('should format footnote definition with multiple spaces', () => {
    const input =
      '[^ref]:   {"type":"url","url":"https://example.com?param=value"}';
    const expected =
      '[^ref]: {"type":"url","url":"https%3A%2F%2Fexample.com%3Fparam%3Dvalue"}';
    expect(footnoteUrlPreprocessor(input)).toBe(expected);
  });

  it('should handle special characters in reference tags', () => {
    const input =
      '[^ref-with-special-chars!@#]: {"type":"url","url":"https://example.com"}';
    const expected =
      '[^ref-with-special-chars!@#]: {"type":"url","url":"https%3A%2F%2Fexample.com"}';
    expect(footnoteUrlPreprocessor(input)).toBe(expected);
  });

  it('should handle incomplete footnote definitions', () => {
    const input = '[^ref]:';
    expect(footnoteUrlPreprocessor(input)).toBe(input);
  });

  it('should handle mixed content with non-footnote text', () => {
    const input = `
Some regular text
[^ref]: {"type":"url","url":"https://example.com"}
More regular text
    `.trim();
    const expected = `
Some regular text
[^ref]: {"type":"url","url":"https%3A%2F%2Fexample.com"}
More regular text
    `.trim();
    expect(footnoteUrlPreprocessor(input)).toBe(expected);
  });

  it('should handle empty input', () => {
    expect(footnoteUrlPreprocessor('')).toBe('');
  });

  it('should handle malformed footnote definitions', () => {
    const input = '[^ref: {"type":"url","url":"https://example.com"}';
    expect(footnoteUrlPreprocessor(input)).toBe(input);
  });

  it('should handle multiple footnotes with mixed content', () => {
    const input = `
[^ref1]: {"type":"url","url":"https://example1.com"}
Some text in between
[^ref2]: {"type":"url","url":"https://example2.com"}
    `.trim();
    const expected = `
[^ref1]: {"type":"url","url":"https%3A%2F%2Fexample1.com"}
Some text in between
[^ref2]: {"type":"url","url":"https%3A%2F%2Fexample2.com"}
    `.trim();
    expect(footnoteUrlPreprocessor(input)).toBe(expected);
  });

  it('should encode partial encoded URLs in footnote definitions', () => {
    const input = `
[^ref]: {"type":"url","url":"https://zh.wikipedia.org/zh-hans/%E5%B0%8F%E7%B1%B3SU7"}
[^ref2]: {"type":"url","url":"https://www.dw.com/zh/%E5%B0%8F%E7%B1%B3%E9%A6%96%E6%AC%BE%E6%B1%BD%E8%BD%A6%E5%8F%91%E5%B8%83-su7%E8%B5%B7%E4%BB%B72159%E4%B8%87%E5%85%83/a-68693432"}
  `.trim();
    const expected = `
[^ref]: {"type":"url","url":"https%3A%2F%2Fzh.wikipedia.org%2Fzh-hans%2F%25E5%25B0%258F%25E7%25B1%25B3SU7"}
[^ref2]: {"type":"url","url":"https%3A%2F%2Fwww.dw.com%2Fzh%2F%25E5%25B0%258F%25E7%25B1%25B3%25E9%25A6%2596%25E6%25AC%25BE%25E6%25B1%25BD%25E8%25BD%25A6%25E5%258F%2591%25E5%25B8%2583-su7%25E8%25B5%25B7%25E4%25BB%25B72159%25E4%25B8%2587%25E5%2585%2583%2Fa-68693432"}
    `.trim();
    expect(footnoteUrlPreprocessor(input)).toBe(expected);
  });
});
