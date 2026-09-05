import type { Root } from 'mdast';
import remarkParse from 'remark-parse';
import remarkStringify from 'remark-stringify';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import { describe, expect, test } from 'vitest';

import {
  flattenTableCellNewlines,
  remarkGfm,
} from '../../../adapters/markdown/gfm';
import { linkDestinationHandlers } from '../../../adapters/markdown/link-destination';

function toMarkdown(tree: Root) {
  return unified()
    .use(remarkGfm)
    .use(remarkStringify, {
      resourceLink: true,
      handlers: linkDestinationHandlers,
    })
    .stringify(tree);
}

function parse(markdown: string): Root {
  const processor = unified().use(remarkParse).use(remarkGfm);
  return processor.runSync(processor.parse(markdown)) as Root;
}

function paragraph(children: unknown[]): Root {
  return {
    type: 'root',
    children: [{ type: 'paragraph', children }],
  } as Root;
}

function link(url: string): Root {
  return paragraph([
    { type: 'link', url, children: [{ type: 'text', value: 'label' }] },
  ]);
}

function firstUrl(markdown: string) {
  let url: string | undefined;
  visit(parse(markdown), ['link', 'image'], node => {
    url ??= (node as unknown as { url: string }).url;
  });
  return url;
}

describe('link destinations survive a round trip', () => {
  const urls = [
    'https://www.figma.com/design/AbC123/Spec?node-id=42-7&t=xY9zQ-4&m=dev',
    'https://example.com/?x=1&copy;=2',
    'https://example.com/?x=1&amp;y=2',
    'https://example.com/?a=1&#169;=2',
    'https://example.com/?a=1&#x2764;=2',
    'https://example.com/(foo)?a=1&b=2',
    'https://example.com/a_(b)?a=1&copy;=2',
  ];

  for (const url of urls) {
    test(url, () => {
      expect(firstUrl(toMarkdown(link(url)))).toBe(url);
    });

    test(`image ${url}`, () => {
      const tree = paragraph([{ type: 'image', url, alt: 'alt' }]);
      expect(firstUrl(toMarkdown(tree))).toBe(url);
    });
  }

  test('a query parameter loses its backslash', () => {
    const url =
      'https://www.figma.com/design/AbC123/Spec?node-id=42-7&t=xY9zQ-4';
    expect(toMarkdown(link(url))).toContain(`&t=xY9zQ-4`);
    expect(toMarkdown(link(url))).not.toContain('\\&');
  });

  test('a character reference keeps its backslash', () => {
    expect(toMarkdown(link('https://example.com/?x=1&copy;=2'))).toContain(
      '\\&copy;'
    );
  });

  test('a title is left alone', () => {
    const tree = paragraph([
      {
        type: 'link',
        url: 'https://example.com/?a=1&b=2',
        title: 'a & b',
        children: [{ type: 'text', value: 'label' }],
      },
    ]);
    expect(toMarkdown(tree).trim()).toBe(
      '[label](https://example.com/?a=1&b=2 "a & b")'
    );
  });
});

describe('literal entities outside a destination are preserved', () => {
  test('body text', () => {
    const markdown = toMarkdown(
      paragraph([{ type: 'text', value: 'a &#xA; b' }])
    );
    expect(firstText(markdown)).toBe('a &#xA; b');
  });

  test('inline code', () => {
    const markdown = toMarkdown(
      paragraph([{ type: 'inlineCode', value: 'a &#xA; b' }])
    );
    expect(markdown.trim()).toBe('`a &#xA; b`');
  });

  test('fenced code', () => {
    const tree = {
      type: 'root',
      children: [{ type: 'code', lang: 'text', value: 'a &#xA; b' }],
    } as Root;
    expect(toMarkdown(tree).trim()).toBe('```text\na &#xA; b\n```');
  });

  test('link shaped text inside code keeps its escapes', () => {
    const tree = {
      type: 'root',
      children: [
        {
          type: 'code',
          lang: 'text',
          value: '[label](https://example.com/?a=1\\&b=2)',
        },
      ],
    } as Root;
    expect(toMarkdown(tree)).toContain('\\&b=2');
  });
});

function firstText(markdown: string) {
  let value: string | undefined;
  visit(parse(markdown), 'text', node => {
    value ??= (node as unknown as { value: string }).value;
  });
  return value;
}

describe('table cells', () => {
  function cell(children: unknown[]) {
    return {
      type: 'root',
      children: [
        {
          type: 'table',
          align: [null],
          children: [
            { type: 'tableRow', children: [{ type: 'tableCell', children }] },
          ],
        },
      ],
    } as Root;
  }

  test('a real newline becomes a space, not an entity', () => {
    const tree = cell([{ type: 'text', value: 'first\nsecond' }]);
    flattenTableCellNewlines(tree);
    const markdown = toMarkdown(tree);

    expect(markdown).toContain('first second');
    expect(markdown).not.toContain('&#xA;');
  });

  test('code in a cell keeps its own text', () => {
    const tree = cell([{ type: 'inlineCode', value: 'a &#xA; b' }]);
    flattenTableCellNewlines(tree);

    expect(toMarkdown(tree)).toContain('a &#xA; b');
  });
});
