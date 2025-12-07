import { DefaultTheme, NoteDisplayMode } from '@blocksuite/affine-model';
import { PdfAdapter } from '@blocksuite/affine-shared/adapters';
import type { BlockSnapshot, DocSnapshot } from '@blocksuite/store';
import { describe, expect, test } from 'vitest';

import { createJob } from '../utils/create-job.js';
import { getProvider } from '../utils/get-provider.js';

const provider = getProvider();

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
        title: 'Test Document',
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
    expect(definition.defaultStyle?.font).toBe('Roboto');
  });
});
