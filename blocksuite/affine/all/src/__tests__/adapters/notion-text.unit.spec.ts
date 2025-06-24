import { DefaultTheme } from '@blocksuite/affine-model';
import { NotionTextAdapter } from '@blocksuite/affine-shared/adapters';
import type { SliceSnapshot } from '@blocksuite/store';
import { describe, expect, test } from 'vitest';

import { createJob } from '../utils/create-job.js';
import { getProvider } from '../utils/get-provider.js';
import { nanoidReplacement } from '../utils/nanoid-replacement.js';

const provider = getProvider();

describe('notion-text to snapshot', () => {
  test('basic', () => {
    const notionText =
      '{"blockType":"text","editing":[["aaa ",[["_"],["b"],["i"]]],["nbbbb ",[["_"],["i"]]],["hjhj ",[["_"]]],["a",[["_"],["c"]]],["  ",[["_"]]],["ccc d",[["_"],["s"]]],["dd",[["_"],["s"]]]]}';

    const sliceSnapshot: SliceSnapshot = {
      type: 'slice',
      content: [
        {
          type: 'block',
          id: 'matchesReplaceMap[0]',
          flavour: 'affine:note',
          props: {
            xywh: '[0,0,800,95]',
            background: DefaultTheme.noteBackgrounColor,
            index: 'a0',
            hidden: false,
            displayMode: 'both',
          },
          children: [
            {
              type: 'block',
              id: 'matchesReplaceMap[1]',
              flavour: 'affine:paragraph',
              props: {
                type: 'text',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'aaa ',
                      attributes: {
                        underline: true,
                        bold: true,
                        italic: true,
                      },
                    },
                    {
                      insert: 'nbbbb ',
                      attributes: {
                        underline: true,
                        italic: true,
                      },
                    },
                    {
                      insert: 'hjhj ',
                      attributes: {
                        underline: true,
                      },
                    },
                    {
                      insert: 'a',
                      attributes: {
                        underline: true,
                        code: true,
                      },
                    },
                    {
                      insert: '  ',
                      attributes: {
                        underline: true,
                      },
                    },
                    {
                      insert: 'ccc d',
                      attributes: {
                        underline: true,
                        strike: true,
                      },
                    },
                    {
                      insert: 'dd',
                      attributes: {
                        underline: true,
                        strike: true,
                      },
                    },
                  ],
                },
              },
              children: [],
            },
          ],
        },
      ],
      workspaceId: '',
      pageId: '',
    };

    const ntAdapter = new NotionTextAdapter(createJob(), provider);
    const target = ntAdapter.toSliceSnapshot({
      file: notionText,
      workspaceId: '',
      pageId: '',
    });
    expect(nanoidReplacement(target!)).toEqual(sliceSnapshot);
  });

  test('notion text with empty styles array', () => {
    const notionText =
      '{"blockType":"text","editing":[["a "],["bold text",[["b"]]],[" hello world"]],"selection":{"startIndex":0,"endIndex":23},"action":"copy"}';

    const sliceSnapshot: SliceSnapshot = {
      type: 'slice',
      content: [
        {
          type: 'block',
          id: 'matchesReplaceMap[0]',
          flavour: 'affine:note',
          props: {
            xywh: '[0,0,800,95]',
            background: DefaultTheme.noteBackgrounColor,
            index: 'a0',
            hidden: false,
            displayMode: 'both',
          },
          children: [
            {
              type: 'block',
              id: 'matchesReplaceMap[1]',
              flavour: 'affine:paragraph',
              props: {
                type: 'text',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'a ',
                    },
                    {
                      insert: 'bold text',
                      attributes: {
                        bold: true,
                      },
                    },
                    {
                      insert: ' hello world',
                    },
                  ],
                },
              },
              children: [],
            },
          ],
        },
      ],
      workspaceId: '',
      pageId: '',
    };

    const ntAdapter = new NotionTextAdapter(createJob(), provider);
    const target = ntAdapter.toSliceSnapshot({
      file: notionText,
      workspaceId: '',
      pageId: '',
    });
    expect(nanoidReplacement(target!)).toEqual(sliceSnapshot);
  });
});
