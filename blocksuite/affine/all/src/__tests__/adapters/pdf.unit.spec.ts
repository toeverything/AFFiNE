import { DefaultTheme, NoteDisplayMode } from '@blocksuite/affine-model';
import { PdfAdapter } from '@blocksuite/affine-shared/adapters';
import type { BlockSnapshot, DocSnapshot } from '@blocksuite/store';
import { AssetsManager, MemoryBlobCRUD } from '@blocksuite/store';
import { describe, expect, test } from 'vitest';

import { createJob } from '../utils/create-job.js';
import { getProvider } from '../utils/get-provider.js';

const provider = getProvider();

// Helper function to create a base snapshot structure
function createBaseSnapshot(
  children: BlockSnapshot['children']
): BlockSnapshot {
  return {
    type: 'block',
    id: 'block:test',
    flavour: 'affine:page',
    props: {
      title: {
        '$blocksuite:internal:text$': true,
        delta: [],
      },
    },
    children: [
      {
        type: 'block',
        id: 'block:surface',
        flavour: 'affine:surface',
        props: {
          elements: {},
        },
        children: [],
      },
      {
        type: 'block',
        id: 'block:note',
        flavour: 'affine:note',
        props: {
          xywh: '[0,0,800,95]',
          background: DefaultTheme.noteBackgrounColor,
          index: 'a0',
          hidden: false,
          displayMode: NoteDisplayMode.DocAndEdgeless,
        },
        children,
      },
    ],
  };
}

describe('snapshot to pdf', () => {
  test('paragraph', async () => {
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'block:test',
      flavour: 'affine:page',
      props: {
        title: {
          '$blocksuite:internal:text$': true,
          delta: [],
        },
      },
      children: [
        {
          type: 'block',
          id: 'block:surface',
          flavour: 'affine:surface',
          props: {
            elements: {},
          },
          children: [],
        },
        {
          type: 'block',
          id: 'block:note',
          flavour: 'affine:note',
          props: {
            xywh: '[0,0,800,95]',
            background: DefaultTheme.noteBackgrounColor,
            index: 'a0',
            hidden: false,
            displayMode: NoteDisplayMode.DocAndEdgeless,
          },
          children: [
            {
              type: 'block',
              id: 'block:paragraph',
              flavour: 'affine:paragraph',
              props: {
                type: 'text',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'Hello World',
                    },
                  ],
                },
              },
              children: [],
            },
          ],
        },
      ],
    };

    const pdfAdapter = new PdfAdapter(createJob(), provider);
    const definition = await pdfAdapter.getDocDefinition(
      [blockSnapshot],
      undefined
    );

    expect(definition.content).toBeDefined();
    expect(Array.isArray(definition.content)).toBe(true);
    const content = definition.content as any[];
    expect(content.length).toBeGreaterThan(0);

    // Find the paragraph content
    const paragraphContent = content.find(
      (item: any) =>
        item.text === 'Hello World' ||
        (Array.isArray(item.text) && item.text.includes('Hello World'))
    );
    expect(paragraphContent).toBeDefined();
  });

  test('code block', async () => {
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'block:test',
      flavour: 'affine:page',
      props: {
        title: {
          '$blocksuite:internal:text$': true,
          delta: [],
        },
      },
      children: [
        {
          type: 'block',
          id: 'block:surface',
          flavour: 'affine:surface',
          props: {
            elements: {},
          },
          children: [],
        },
        {
          type: 'block',
          id: 'block:note',
          flavour: 'affine:note',
          props: {
            xywh: '[0,0,800,95]',
            background: DefaultTheme.noteBackgrounColor,
            index: 'a0',
            hidden: false,
            displayMode: NoteDisplayMode.DocAndEdgeless,
          },
          children: [
            {
              type: 'block',
              id: 'block:code',
              flavour: 'affine:code',
              props: {
                language: 'python',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'print("Hello")',
                    },
                  ],
                },
              },
              children: [],
            },
          ],
        },
      ],
    };

    const pdfAdapter = new PdfAdapter(createJob(), provider);
    const definition = await pdfAdapter.getDocDefinition(
      [blockSnapshot],
      undefined
    );

    expect(definition.content).toBeDefined();
    const content = definition.content as any[];

    // Find code block table
    const codeBlock = content.find(
      (item: any) => item.table && item.table.body
    );
    expect(codeBlock).toBeDefined();
    expect(codeBlock.table.body).toBeDefined();
  });

  test('list items', async () => {
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'block:test',
      flavour: 'affine:page',
      props: {
        title: {
          '$blocksuite:internal:text$': true,
          delta: [],
        },
      },
      children: [
        {
          type: 'block',
          id: 'block:surface',
          flavour: 'affine:surface',
          props: {
            elements: {},
          },
          children: [],
        },
        {
          type: 'block',
          id: 'block:note',
          flavour: 'affine:note',
          props: {
            xywh: '[0,0,800,95]',
            background: DefaultTheme.noteBackgrounColor,
            index: 'a0',
            hidden: false,
            displayMode: NoteDisplayMode.DocAndEdgeless,
          },
          children: [
            {
              type: 'block',
              id: 'block:list1',
              flavour: 'affine:list',
              props: {
                type: 'bulleted',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'Item 1',
                    },
                  ],
                },
              },
              children: [],
            },
            {
              type: 'block',
              id: 'block:list2',
              flavour: 'affine:list',
              props: {
                type: 'bulleted',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'Item 2',
                    },
                  ],
                },
              },
              children: [],
            },
          ],
        },
      ],
    };

    const pdfAdapter = new PdfAdapter(createJob(), provider);
    const definition = await pdfAdapter.getDocDefinition(
      [blockSnapshot],
      undefined
    );

    expect(definition.content).toBeDefined();
    const content = definition.content as any[];

    // Find list items (they should be tables with 2 columns)
    const listItems = content.filter(
      (item: any) =>
        item.table && item.table.widths && item.table.widths.length === 2
    );
    expect(listItems.length).toBeGreaterThanOrEqual(2);
  });

  test('header', async () => {
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'block:test',
      flavour: 'affine:page',
      props: {
        title: {
          '$blocksuite:internal:text$': true,
          delta: [],
        },
      },
      children: [
        {
          type: 'block',
          id: 'block:surface',
          flavour: 'affine:surface',
          props: {
            elements: {},
          },
          children: [],
        },
        {
          type: 'block',
          id: 'block:note',
          flavour: 'affine:note',
          props: {
            xywh: '[0,0,800,95]',
            background: DefaultTheme.noteBackgrounColor,
            index: 'a0',
            hidden: false,
            displayMode: NoteDisplayMode.DocAndEdgeless,
          },
          children: [
            {
              type: 'block',
              id: 'block:header',
              flavour: 'affine:paragraph',
              props: {
                type: 'h1',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'Heading 1',
                    },
                  ],
                },
              },
              children: [],
            },
          ],
        },
      ],
    };

    const pdfAdapter = new PdfAdapter(createJob(), provider);
    const definition = await pdfAdapter.getDocDefinition(
      [blockSnapshot],
      undefined
    );

    expect(definition.content).toBeDefined();
    const content = definition.content as any[];

    // Find header content
    const header = content.find(
      (item: any) =>
        item.style === 'header1' ||
        (item.text &&
          (item.text === 'Heading 1' ||
            (Array.isArray(item.text) && item.text.includes('Heading 1'))))
    );
    expect(header).toBeDefined();
    if (header.style) {
      expect(header.style).toBe('header1');
    }
  });

  test('document with title', async () => {
    const docSnapshot: DocSnapshot = {
      type: 'page',
      meta: {
        id: 'testDocument',
        title: 'Test Document',
        createDate: 1718225423102,
        tags: [],
      },
      blocks: {
        type: 'block',
        id: 'block:test',
        flavour: 'affine:page',
        props: {
          title: {
            '$blocksuite:internal:text$': true,
            delta: [],
          },
        },
        children: [
          {
            type: 'block',
            id: 'block:surface',
            flavour: 'affine:surface',
            props: {
              elements: {},
            },
            children: [],
          },
          {
            type: 'block',
            id: 'block:note',
            flavour: 'affine:note',
            props: {
              xywh: '[0,0,800,95]',
              background: DefaultTheme.noteBackgrounColor,
              index: 'a0',
              hidden: false,
              displayMode: NoteDisplayMode.DocAndEdgeless,
            },
            children: [],
          },
        ],
      },
    };

    const pdfAdapter = new PdfAdapter(createJob(), provider);
    const definition = await pdfAdapter.getDocDefinition(
      [docSnapshot.blocks],
      docSnapshot.meta?.title
    );

    expect(definition.content).toBeDefined();
    const content = definition.content as any[];

    // First item should be the title
    expect(content[0].text).toBe('Test Document');
    expect(content[0].style).toBe('title');
  });

  test('styles definition', async () => {
    const pdfAdapter = new PdfAdapter(createJob(), provider);
    const definition = await pdfAdapter.getDocDefinition([], undefined);

    expect(definition.styles).toBeDefined();
    expect(definition.styles?.title).toBeDefined();
    expect(definition.styles?.header1).toBeDefined();
    expect(definition.styles?.header2).toBeDefined();
    expect(definition.styles?.header3).toBeDefined();
    expect(definition.styles?.header4).toBeDefined();
    expect(definition.styles?.code).toBeDefined();

    expect(definition.defaultStyle).toBeDefined();
    expect(definition.defaultStyle?.font).toBe('SarasaGothicCL');
  });

  describe('inline text styling', () => {
    test('bold text', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:paragraph',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'Bold text',
                  attributes: { bold: true },
                },
              ],
            },
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      const content = definition.content as any[];
      const textContent = content.find((item: any) => item.text);
      expect(textContent).toBeDefined();

      if (Array.isArray(textContent.text)) {
        const styledText = textContent.text.find(
          (t: any) => typeof t === 'object' && t.bold === true
        );
        expect(styledText).toBeDefined();
        expect(styledText.text).toBe('Bold text');
      }
    });

    test('italic text', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:paragraph',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'Italic text',
                  attributes: { italic: true },
                },
              ],
            },
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      const content = definition.content as any[];
      const textContent = content.find((item: any) => item.text);
      expect(textContent).toBeDefined();

      if (Array.isArray(textContent.text)) {
        const styledText = textContent.text.find(
          (t: any) => typeof t === 'object' && t.italics === true
        );
        expect(styledText).toBeDefined();
        expect(styledText.text).toBe('Italic text');
      }
    });

    test('underline text', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:paragraph',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'Underlined text',
                  attributes: { underline: true },
                },
              ],
            },
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      const content = definition.content as any[];
      const textContent = content.find((item: any) => item.text);
      expect(textContent).toBeDefined();

      if (Array.isArray(textContent.text)) {
        const styledText = textContent.text.find(
          (t: any) =>
            typeof t === 'object' &&
            (t.decoration === 'underline' ||
              (Array.isArray(t.decoration) &&
                t.decoration.includes('underline')))
        );
        expect(styledText).toBeDefined();
        expect(styledText.text).toBe('Underlined text');
      }
    });

    test('strikethrough text', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:paragraph',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'Strikethrough text',
                  attributes: { strike: true },
                },
              ],
            },
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      const content = definition.content as any[];
      const textContent = content.find((item: any) => item.text);
      expect(textContent).toBeDefined();

      if (Array.isArray(textContent.text)) {
        const styledText = textContent.text.find(
          (t: any) =>
            typeof t === 'object' &&
            (t.decoration === 'lineThrough' ||
              (Array.isArray(t.decoration) &&
                t.decoration.includes('lineThrough')))
        );
        expect(styledText).toBeDefined();
        expect(styledText.text).toBe('Strikethrough text');
      }
    });

    test('inline code', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:paragraph',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'code',
                  attributes: { code: true },
                },
              ],
            },
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      const content = definition.content as any[];
      const textContent = content.find((item: any) => item.text);
      expect(textContent).toBeDefined();

      if (Array.isArray(textContent.text)) {
        const codeText = textContent.text.find(
          (t: any) =>
            typeof t === 'object' &&
            t.font === 'Inter' &&
            t.background === '#f5f5f5'
        );
        expect(codeText).toBeDefined();
        expect(codeText.text).toContain('code');
      }
    });

    test('combined styles', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:paragraph',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'Bold and italic',
                  attributes: { bold: true, italic: true },
                },
              ],
            },
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      const content = definition.content as any[];
      const textContent = content.find((item: any) => item.text);
      expect(textContent).toBeDefined();

      if (Array.isArray(textContent.text)) {
        const styledText = textContent.text.find(
          (t: any) =>
            typeof t === 'object' && t.bold === true && t.italics === true
        );
        expect(styledText).toBeDefined();
      }
    });
  });

  describe('links and references', () => {
    test('link attribute', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:paragraph',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'Click here',
                  attributes: { link: 'https://example.com' },
                },
              ],
            },
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      const content = definition.content as any[];
      const textContent = content.find((item: any) => item.text);
      expect(textContent).toBeDefined();

      if (Array.isArray(textContent.text)) {
        const linkText = textContent.text.find(
          (t: any) => typeof t === 'object' && t.link === 'https://example.com'
        );
        expect(linkText).toBeDefined();
        expect(linkText.color).toBe('#0066cc');
      }
    });

    test('linked page reference - found', async () => {
      const job = createJob();
      const pdfAdapter = new PdfAdapter(job, provider);
      pdfAdapter.configs.set('title:page123', 'Referenced Page');
      pdfAdapter.configs.set('docLinkBaseUrl', 'https://example.com/doc');

      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:paragraph',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: ' ',
                  attributes: {
                    reference: {
                      type: 'LinkedPage',
                      pageId: 'page123',
                    },
                  },
                },
              ],
            },
          },
          children: [],
        },
      ]);

      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      const content = definition.content as any[];
      const textContent = content.find((item: any) => item.text);
      expect(textContent).toBeDefined();

      if (Array.isArray(textContent.text)) {
        const refText = textContent.text.find(
          (t: any) =>
            typeof t === 'object' &&
            t.text === 'Referenced Page' &&
            t.link === 'https://example.com/doc/page123'
        );
        expect(refText).toBeDefined();
        expect(refText.color).toBe('#0066cc');
      }
    });

    test('linked page reference - not found', async () => {
      const job = createJob();
      const pdfAdapter = new PdfAdapter(job, provider);
      pdfAdapter.configs.set('docLinkBaseUrl', 'https://example.com/doc');

      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:paragraph',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: ' ',
                  attributes: {
                    reference: {
                      type: 'LinkedPage',
                      pageId: 'nonexistent',
                    },
                  },
                },
              ],
            },
          },
          children: [],
        },
      ]);

      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      const content = definition.content as any[];
      const textContent = content.find((item: any) => item.text);
      expect(textContent).toBeDefined();

      if (Array.isArray(textContent.text)) {
        const refText = textContent.text.find(
          (t: any) => typeof t === 'object' && t.text === 'Page not found'
        );
        expect(refText).toBeDefined();
      }
    });
  });

  describe('quote blocks', () => {
    test('quote block with text', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:quote',
          flavour: 'affine:paragraph',
          props: {
            type: 'quote',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'This is a quote',
                },
              ],
            },
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      const content = definition.content as any[];
      const quoteBlock = content.find(
        (item: any) =>
          item.table &&
          item.table.widths &&
          item.table.widths.length === 2 &&
          item.table.widths[0] === 2
      );
      expect(quoteBlock).toBeDefined();
      expect(quoteBlock.table.body[0][0].fillColor).toBe('#cccccc');
    });

    test('quote block with children', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:quote',
          flavour: 'affine:paragraph',
          props: {
            type: 'quote',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'Quote text',
                },
              ],
            },
          },
          children: [
            {
              type: 'block',
              id: 'block:child',
              flavour: 'affine:paragraph',
              props: {
                type: 'text',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'Child paragraph',
                    },
                  ],
                },
              },
              children: [],
            },
          ],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      const content = definition.content as any[];
      const quoteBlock = content.find(
        (item: any) =>
          item.table && item.table.widths && item.table.widths.length === 2
      );
      expect(quoteBlock).toBeDefined();
      expect(quoteBlock.table.body[0][1].stack).toBeDefined();
    });
  });

  describe('callout blocks', () => {
    test('callout with default background', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:callout',
          flavour: 'affine:callout',
          props: {
            backgroundColorName: 'grey',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'Callout content',
                },
              ],
            },
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      const content = definition.content as any[];
      const calloutBlock = content.find(
        (item: any) =>
          item.table && item.table.widths && item.table.widths.length === 1
      );
      expect(calloutBlock).toBeDefined();
      expect(calloutBlock.table.body[0][0].fillColor).toBeDefined();
    });

    test('callout with custom background color', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:callout',
          flavour: 'affine:callout',
          props: {
            backgroundColorName: 'blue',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'Blue callout',
                },
              ],
            },
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      const content = definition.content as any[];
      const calloutBlock = content.find(
        (item: any) =>
          item.table && item.table.widths && item.table.widths.length === 1
      );
      expect(calloutBlock).toBeDefined();
      expect(calloutBlock.table.body[0][0].fillColor).toBeDefined();
    });

    test('callout with children', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:callout',
          flavour: 'affine:callout',
          props: {
            backgroundColorName: 'grey',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'Callout',
                },
              ],
            },
          },
          children: [
            {
              type: 'block',
              id: 'block:child',
              flavour: 'affine:paragraph',
              props: {
                type: 'text',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'Child content',
                    },
                  ],
                },
              },
              children: [],
            },
          ],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      const content = definition.content as any[];
      const calloutBlock = content.find(
        (item: any) =>
          item.table && item.table.widths && item.table.widths.length === 1
      );
      expect(calloutBlock).toBeDefined();
      expect(calloutBlock.table.body[0][0].stack).toBeDefined();
    });
  });

  describe('image handling', () => {
    test('image without sourceId', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:image',
          flavour: 'affine:image',
          props: {
            sourceId: undefined,
            caption: 'Test caption',
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      const content = definition.content as any[];
      const imageContent = content.find(
        (item: any) =>
          item.text &&
          (item.text === '[Image: Test caption]' || item.text.includes('Image'))
      );
      expect(imageContent).toBeDefined();
      expect(imageContent.italics).toBe(true);
    });

    test('SVG image', async () => {
      const blobCRUD = new MemoryBlobCRUD();
      const svgBlob = new Blob(
        [
          '<svg width="100" height="100"><rect width="100" height="100"/></svg>',
        ],
        {
          type: 'image/svg+xml',
        }
      );
      const blobId = await blobCRUD.set(svgBlob);
      const assets = new AssetsManager({ blob: blobCRUD });
      await assets.readFromBlob(blobId);
      assets.getAssets().set(blobId, svgBlob);

      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:image',
          flavour: 'affine:image',
          props: {
            sourceId: blobId,
            caption: 'SVG Image',
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined,
        assets
      );

      const content = definition.content as any[];
      const svgContent = content.find((item: any) => item.svg);
      expect(svgContent).toBeDefined();
      expect(svgContent.svg).toContain('<svg');
    });

    test('image with missing asset', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:image',
          flavour: 'affine:image',
          props: {
            sourceId: 'nonexistent-blob-id',
            caption: 'Missing image',
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      const content = definition.content as any[];
      const fallbackContent = content.find(
        (item: any) =>
          item.text &&
          (item.text === '[Image: Missing image]' ||
            item.text.includes('Image'))
      );
      expect(fallbackContent).toBeDefined();
    });

    test('image with width and height', async () => {
      const blobCRUD = new MemoryBlobCRUD();
      const svgBlob = new Blob(
        [
          '<svg width="200" height="150"><rect width="200" height="150"/></svg>',
        ],
        {
          type: 'image/svg+xml',
        }
      );
      const blobId = await blobCRUD.set(svgBlob);
      const assets = new AssetsManager({ blob: blobCRUD });
      await assets.readFromBlob(blobId);
      assets.getAssets().set(blobId, svgBlob);

      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:image',
          flavour: 'affine:image',
          props: {
            sourceId: blobId,
            width: 300,
            height: 200,
            caption: 'Sized image',
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined,
        assets
      );

      const content = definition.content as any[];
      const svgContent = content.find((item: any) => item.svg);
      expect(svgContent).toBeDefined();
      expect(svgContent.width).toBeDefined();
      expect(svgContent.height).toBeDefined();
    });

    test('image text alignment', async () => {
      const blobCRUD = new MemoryBlobCRUD();
      const svgBlob = new Blob(['<svg width="100" height="100"></svg>'], {
        type: 'image/svg+xml',
      });
      const blobId = await blobCRUD.set(svgBlob);
      const assets = new AssetsManager({ blob: blobCRUD });
      await assets.readFromBlob(blobId);
      assets.getAssets().set(blobId, svgBlob);

      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:image',
          flavour: 'affine:image',
          props: {
            sourceId: blobId,
            textAlign: 'right',
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined,
        assets
      );

      const content = definition.content as any[];
      const svgContent = content.find((item: any) => item.svg);
      expect(svgContent).toBeDefined();
      expect(svgContent.alignment).toBe('right');
    });
  });

  describe('table rendering', () => {
    test('table with cells', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:table',
          flavour: 'affine:table',
          props: {
            columns: {
              col1: {
                columnId: 'col1',
                order: 'a0',
              },
              col2: {
                columnId: 'col2',
                order: 'a1',
              },
            },
            rows: {
              row1: {
                rowId: 'row1',
                order: 'a0',
              },
              row2: {
                rowId: 'row2',
                order: 'a1',
              },
            },
            cells: {
              'row1:col1': {
                text: {
                  delta: [{ insert: 'Cell 1-1' }],
                },
              },
              'row1:col2': {
                text: {
                  delta: [{ insert: 'Cell 1-2' }],
                },
              },
              'row2:col1': {
                text: {
                  delta: [{ insert: 'Cell 2-1' }],
                },
              },
              'row2:col2': {
                text: {
                  delta: [{ insert: 'Cell 2-2' }],
                },
              },
            },
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      const content = definition.content as any[];
      const table = content.find(
        (item: any) =>
          item.table && item.table.body && Array.isArray(item.table.body)
      );
      expect(table).toBeDefined();
      expect(table.table.body.length).toBe(2);
      expect(table.table.body[0].length).toBe(2);
    });

    test('empty table', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:table',
          flavour: 'affine:table',
          props: {
            columns: {},
            rows: {},
            cells: {},
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      const content = definition.content as any[];
      const table = content.find((item: any) => item.table && item.table.body);
      expect(table).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    test('empty paragraph', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:paragraph',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [],
            },
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      expect(definition.content).toBeDefined();
      const content = definition.content as any[];
      expect(content.length).toBeGreaterThan(0);
    });

    test('paragraph with empty delta', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:paragraph',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [{ insert: '' }],
            },
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      expect(definition.content).toBeDefined();
    });

    test('malformed delta operations', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:paragraph',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                { insert: 123 as any }, // Invalid type
                { insert: 'Valid text' },
              ],
            },
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      expect(definition.content).toBeDefined();
      const content = definition.content as any[];
      const textContent = content.find((item: any) => item.text);
      expect(textContent).toBeDefined();
    });

    test('text alignment', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:paragraph',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            textAlign: 'center',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'Centered text',
                },
              ],
            },
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      const content = definition.content as any[];
      const paragraph = content.find(
        (item: any) =>
          item.text &&
          (item.text === 'Centered text' ||
            (Array.isArray(item.text) &&
              item.text.some((t: any) =>
                typeof t === 'string'
                  ? t === 'Centered text'
                  : t.text === 'Centered text'
              )))
      );
      expect(paragraph).toBeDefined();
      expect(paragraph.alignment).toBe('center');
    });

    test('nested list items', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:list1',
          flavour: 'affine:list',
          props: {
            type: 'bulleted',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'Parent item',
                },
              ],
            },
          },
          children: [
            {
              type: 'block',
              id: 'block:list2',
              flavour: 'affine:list',
              props: {
                type: 'bulleted',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'Child item',
                    },
                  ],
                },
              },
              children: [],
            },
          ],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      expect(definition.content).toBeDefined();
      const content = definition.content as any[];
      const listItems = content.filter(
        (item: any) =>
          item.table && item.table.widths && item.table.widths.length === 2
      );
      expect(listItems.length).toBeGreaterThanOrEqual(2);
    });

    test('numbered list with order', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:list1',
          flavour: 'affine:list',
          props: {
            type: 'numbered',
            order: 5,
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'Item 5',
                },
              ],
            },
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      const content = definition.content as any[];
      const listItem = content.find(
        (item: any) =>
          item.table &&
          item.table.body &&
          item.table.body[0] &&
          item.table.body[0][0] &&
          item.table.body[0][0].text
      );
      expect(listItem).toBeDefined();
      expect(listItem.table.body[0][0].text).toContain('5.');
    });

    test('todo list checked', async () => {
      const blockSnapshot = createBaseSnapshot([
        {
          type: 'block',
          id: 'block:todo',
          flavour: 'affine:list',
          props: {
            type: 'todo',
            checked: true,
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'Completed task',
                },
              ],
            },
          },
          children: [],
        },
      ]);

      const pdfAdapter = new PdfAdapter(createJob(), provider);
      const definition = await pdfAdapter.getDocDefinition(
        [blockSnapshot],
        undefined
      );

      const content = definition.content as any[];
      const todoItem = content.find(
        (item: any) =>
          item.table &&
          item.table.body &&
          item.table.body[0] &&
          item.table.body[0][0] &&
          item.table.body[0][0].svg
      );
      expect(todoItem).toBeDefined();
      expect(todoItem.table.body[0][0].svg).toContain('svg');
    });
  });
});
