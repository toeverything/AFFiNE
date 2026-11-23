import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';

import { rehypeInlineToBlock } from '../../../../adapters/html/rehype-plugins/inline-to-block';

describe('rehypeInlineToBlock', () => {
  const process = (html: string) => {
    return unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeInlineToBlock)
      .use(rehypeStringify)
      .processSync(html)
      .toString();
  };

  it('should not transform inline elements without block children', () => {
    const input = '<b>Hello World</b>';
    const output = process(input);
    expect(output).toBe('<b>Hello World</b>');
  });

  it('should transform inline elements containing block children', () => {
    const input = '<b><p>Hello World</p></b>';
    const output = process(input);
    expect(output).toBe('<div data-original-tag="b"><p>Hello World</p></div>');
  });

  it('should preserve existing attributes when transforming', () => {
    const input = '<b class="test" id="demo"><p>Hello World</p></b>';
    const output = process(input);
    expect(output).toBe(
      '<div class="test" id="demo" data-original-tag="b"><p>Hello World</p></div>'
    );
  });

  it('should handle multiple block elements within inline element', () => {
    const input = '<b><p>First</p><div>Second</div><h1>Third</h1></b>';
    const output = process(input);
    expect(output).toBe(
      '<div data-original-tag="b"><p>First</p><div>Second</div><h1>Third</h1></div>'
    );
  });

  it('should handle mixed content (text and block elements)', () => {
    const input = '<b>Text before<p>Block element</p>Text after</b>';
    const output = process(input);
    expect(output).toBe(
      '<div data-original-tag="b">Text before<p>Block element</p>Text after</div>'
    );
  });

  it('should handle complex nested structures', () => {
    const input = '<b><div><p>Nested <b>inline</b> content</p></div></b>';
    const output = process(input);
    expect(output).toBe(
      '<div data-original-tag="b"><div><p>Nested <b>inline</b> content</p></div></div>'
    );
  });
});
