import rehypeParse from 'rehype-parse';
import rehypeStringify from 'rehype-stringify';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';

import { rehypeWrapInlineElements } from '../../../../adapters/html/rehype-plugins/wrap-inline-element';

describe('rehypeWrapInlineElements', () => {
  const process = (html: string) => {
    return unified()
      .use(rehypeParse, { fragment: true })
      .use(rehypeWrapInlineElements)
      .use(rehypeStringify)
      .processSync(html)
      .toString();
  };

  it('should not wrap inline elements without block children in a div tag', () => {
    const input = '<div><span>Hello World</span></div>';
    const output = process(input);
    expect(output).toBe('<div><span>Hello World</span></div>');
  });

  it('should not wrap elements without inline children in a div tag', () => {
    const input = '<div><h1>Hello World</h1></div>';
    const output = process(input);
    expect(output).toBe('<div><h1>Hello World</h1></div>');
  });

  it('should wrap inline elements containing block children in a p tag', () => {
    const input = '<div><p>Hello World</p><span>Hello World</span></div>';
    const output = process(input);
    expect(output).toBe(
      '<div><p>Hello World</p><p><span>Hello World</span></p></div>'
    );
  });

  it('should wrap inline elements sequentially', () => {
    const input =
      '<div><p>Hello World</p><span>Hello</span><span>World</span></div>';
    const output = process(input);
    expect(output).toBe(
      '<div><p>Hello World</p><p><span>Hello</span><span>World</span></p></div>'
    );
  });

  it('should wrap inline elements sequentially mixed with block elements', () => {
    const input =
      '<div><p>Hello World</p><span>Hello</span><span>World</span><h1>Title</h1><span>Hello</span><span>World</span></div>';
    const output = process(input);
    expect(output).toBe(
      '<div><p>Hello World</p><p><span>Hello</span><span>World</span></p><h1>Title</h1><p><span>Hello</span><span>World</span></p></div>'
    );
  });
});
