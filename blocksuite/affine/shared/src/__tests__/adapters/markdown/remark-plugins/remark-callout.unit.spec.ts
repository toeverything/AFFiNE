import type { Blockquote, Paragraph } from 'mdast';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { describe, expect, it } from 'vitest';

import { remarkGfm } from '../../../../adapters/markdown/gfm';
import { remarkCallout } from '../../../../adapters/markdown/remark-plugins/remark-callout';
import type { MarkdownAST } from '../../../../adapters/markdown/type';

describe('remarkCallout plugin', () => {
  function isBlockQuote(node: MarkdownAST): node is Blockquote {
    return node.type === 'blockquote';
  }

  function isParagraph(node: MarkdownAST): node is Paragraph {
    return node.type === 'paragraph';
  }

  const process = (content: string) => {
    const processor = unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkCallout);
    const ast = processor.parse(content);
    return processor.runSync(ast);
  };

  const assertCallout = (
    root: any,
    expectedEmoji: string,
    expectedText?: string
  ) => {
    const firstChild = root.children[0];
    expect(isBlockQuote(firstChild)).toBe(true);
    expect(firstChild.data).toEqual({
      isCallout: true,
      calloutEmoji: expectedEmoji,
    });

    if (expectedText !== undefined) {
      if (expectedText === '') {
        // if expectedText is empty, the callout should not have any children
        expect(firstChild.children).toHaveLength(0);
      } else {
        const firstParagraph = firstChild.children[0];
        expect(isParagraph(firstParagraph)).toBe(true);
        expect(firstParagraph.children[0].value).toBe(expectedText);
      }
    }
  };

  const assertRegularBlockquote = (root: any, expectedText: string) => {
    const firstChild = root.children[0];
    expect(isBlockQuote(firstChild)).toBe(true);
    expect(firstChild.data).toBeUndefined();

    const firstParagraph = firstChild.children[0];
    expect(isParagraph(firstParagraph)).toBe(true);
    expect(firstParagraph.children[0].value).toBe(expectedText);
  };

  it('should transform callout with emoji and text in the same line', async () => {
    const root = process('> [!💡] This is a callout with emoji');
    assertCallout(root, '💡', 'This is a callout with emoji');
  });

  it('should transform callout without emoji and text in the same line', async () => {
    const root = process('> [!] This is a callout without emoji');
    assertCallout(root, '', 'This is a callout without emoji');
  });

  it('should handle callout with multiple lines and text in the different line', async () => {
    const root = process('> [!💡]\n> with multiple lines');
    assertCallout(root, '💡', 'with multiple lines');
  });

  it('should handle empty callout', async () => {
    const root = process('> [!💡]');
    assertCallout(root, '💡', '');
  });

  it('should handle callout with leading whitespace', async () => {
    const root = process(
      '>  [!💡]\n> This is a callout with leading whitespace\n    '
    );
    assertCallout(root, '💡', 'This is a callout with leading whitespace');
  });

  it('should handle callout with trailing whitespace', async () => {
    const root = process(
      '> [!💡]\n> This is a callout with trailing whitespace\n    '
    );
    assertCallout(root, '💡', 'This is a callout with trailing whitespace');
  });

  it('should not transform regular blockquote', async () => {
    const root = process('> This is a regular blockquote');
    assertRegularBlockquote(root, 'This is a regular blockquote');
  });

  it('should not transform regular blockquote when the emoji is not in the start of the line', async () => {
    const root = process('> This is a regular blockquote [!💡]');
    assertRegularBlockquote(root, 'This is a regular blockquote [!💡]');
  });

  it('should not transform when callout marker is in the middle of text', async () => {
    const root = process(
      '> This is a regular blockquote with [!💡] in the middle'
    );
    assertRegularBlockquote(
      root,
      'This is a regular blockquote with [!💡] in the middle'
    );
  });

  it('should handle multiple callouts in the same document', async () => {
    const root = process(
      `> [!💡] First callout\n\n> [!] Second callout without emoji`
    );
    expect(root.children).toHaveLength(2);

    assertCallout({ children: [root.children[0]] }, '💡', 'First callout');
    assertCallout(
      { children: [root.children[1]] },
      '',
      'Second callout without emoji'
    );
  });

  it('should handle multiple callouts and regular blockquote in the same document', async () => {
    const root = process(
      `> [!💡] First callout\n\n> [!] Second callout without emoji\n\n> This is a regular blockquote`
    );
    expect(root.children).toHaveLength(3);

    assertCallout({ children: [root.children[0]] }, '💡', 'First callout');
    assertCallout(
      { children: [root.children[1]] },
      '',
      'Second callout without emoji'
    );
    assertRegularBlockquote(
      { children: [root.children[2]] },
      'This is a regular blockquote'
    );
  });
});
