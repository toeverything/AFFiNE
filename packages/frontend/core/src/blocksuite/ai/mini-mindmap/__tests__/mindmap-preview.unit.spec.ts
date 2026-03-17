import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { Container } from '@blocksuite/affine/global/di';
import { TestWorkspace } from '@blocksuite/affine/store/test';
import { describe, expect, test } from 'vitest';

import { markdownToMindmap } from '../mindmap-preview.js';

const container = new Container();
getStoreManager()
  .value.get('store')
  .forEach(ext => {
    ext.setup(container);
  });
const provider = container.provider();

describe('markdownToMindmap: convert markdown list to a mind map tree', () => {
  test('basic case', () => {
    const markdown = `
- Text A
  - Text B
    - Text C
  - Text D
    - Text E
`;
    const collection = new TestWorkspace();
    collection.meta.initialize();
    const doc = collection.createDoc().getStore();
    const nodes = markdownToMindmap(markdown, doc, provider);

    expect(nodes).toEqual({
      text: 'Text A',
      children: [
        {
          text: 'Text B',
          children: [
            {
              text: 'Text C',
              children: [],
            },
          ],
        },
        {
          text: 'Text D',
          children: [
            {
              text: 'Text E',
              children: [],
            },
          ],
        },
      ],
    });
  });

  test('basic case with different indent', () => {
    const markdown = `
- Text A
    - Text B
        - Text C
    - Text D
        - Text E
`;
    const collection = new TestWorkspace();
    collection.meta.initialize();
    const doc = collection.createDoc().getStore();
    const nodes = markdownToMindmap(markdown, doc, provider);

    expect(nodes).toEqual({
      text: 'Text A',
      children: [
        {
          text: 'Text B',
          children: [
            {
              text: 'Text C',
              children: [],
            },
          ],
        },
        {
          text: 'Text D',
          children: [
            {
              text: 'Text E',
              children: [],
            },
          ],
        },
      ],
    });
  });

  test('empty case', () => {
    const markdown = '';
    const collection = new TestWorkspace();
    collection.meta.initialize();
    const doc = collection.createDoc().getStore();
    const nodes = markdownToMindmap(markdown, doc, provider);

    expect(nodes).toEqual(null);
  });

  test('accepts leading plain text before the markdown list', () => {
    const markdown = `Here is the regenerated mind map:

- Text A
  - Text B`;
    const collection = new TestWorkspace();
    collection.meta.initialize();
    const doc = collection.createDoc().getStore();
    const nodes = markdownToMindmap(markdown, doc, provider);

    expect(nodes).toEqual({
      text: 'Text A',
      children: [
        {
          text: 'Text B',
          children: [],
        },
      ],
    });
  });

  test('accepts markdown lists wrapped in a code block', () => {
    const markdown = `\`\`\`markdown
- Text A
  - Text B
\`\`\``;
    const collection = new TestWorkspace();
    collection.meta.initialize();
    const doc = collection.createDoc().getStore();
    const nodes = markdownToMindmap(markdown, doc, provider);

    expect(nodes).toEqual({
      text: 'Text A',
      children: [
        {
          text: 'Text B',
          children: [],
        },
      ],
    });
  });

  test('keeps inline markdown content inside node labels', () => {
    const markdown = `
- Root with [link](https://example.com) and [^1]
  - Child with \`code\`

[^1]: footnote
`;
    const collection = new TestWorkspace();
    collection.meta.initialize();
    const doc = collection.createDoc().getStore();
    const nodes = markdownToMindmap(markdown, doc, provider);

    expect(nodes).toEqual({
      text: 'Root with link and',
      children: [
        {
          text: 'Child with code',
          children: [],
        },
      ],
    });
  });
});
