import { DefaultTheme, NoteDisplayMode } from '@blocksuite/affine-model';
import {
  embedSyncedDocMiddleware,
  HtmlAdapter,
} from '@blocksuite/affine-shared/adapters';
import type {
  BlockSnapshot,
  DocSnapshot,
  TransformerMiddleware,
} from '@blocksuite/store';
import { AssetsManager, MemoryBlobCRUD } from '@blocksuite/store';
import { describe, expect, test } from 'vitest';

import { createJob } from '../utils/create-job.js';
import { getProvider } from '../utils/get-provider.js';
import { nanoidReplacement } from '../utils/nanoid-replacement.js';

const provider = getProvider();

describe('snapshot to html', () => {
  const template = (html: string, title?: string) => {
    let htmlTemplate = `
  <!doctype html>
  <html>
  <head>
    <style>
      input[type='checkbox'] {
        display: none;
      }
      label:before {
        background: rgb(30, 150, 235);
        border-radius: 3px;
        height: 16px;
        width: 16px;
        display: inline-block;
        cursor: pointer;
      }
      input[type='checkbox'] + label:before {
        content: '';
        background: rgb(30, 150, 235);
        color: #fff;
        font-size: 16px;
        line-height: 16px;
        text-align: center;
      }
      input[type='checkbox']:checked + label:before {
        content: '✓';
      }
    </style>
  </head>
  <body>
  <div style="width: 70vw; margin: 60px auto;"><!--BlockSuiteDocTitlePlaceholder-->
  <!--HtmlTemplate-->
  </div>
  </body>
  </html>
  `
      .replace(/\s\s+|\n/g, '')
      .replace('<!--HtmlTemplate-->', html);
    if (title) {
      htmlTemplate = htmlTemplate.replace(
        '<!--BlockSuiteDocTitlePlaceholder-->',
        `<h1>${title}</h1>`
      );
    }
    return htmlTemplate;
  };

  const paragraphTemplate = (html: string) =>
    `<div class="affine-paragraph-block-container">${html}<div class="affine-block-children-container" style="padding-left: 26px;"></div></div>`;

  test('code', async () => {
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'block:vu6SK6WJpW',
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
          id: 'block:Tk4gSPocAt',
          flavour: 'affine:surface',
          props: {
            elements: {},
          },
          children: [],
        },
        {
          type: 'block',
          id: 'block:WfnS5ZDCJT',
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
              id: 'block:8hOLxad5Fv',
              flavour: 'affine:code',
              props: {
                language: 'python',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'import this',
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

    const html = template(
      `<pre><code class="code-python">import this</code></pre>`
    );

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const target = await htmlAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(html);
  });

  test('code upper case', async () => {
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'block:vu6SK6WJpW',
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
          id: 'block:Tk4gSPocAt',
          flavour: 'affine:surface',
          props: {
            elements: {},
          },
          children: [],
        },
        {
          type: 'block',
          id: 'block:WfnS5ZDCJT',
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
              id: 'block:8hOLxad5Fv',
              flavour: 'affine:code',
              props: {
                language: 'PYTHON',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'import this',
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

    const html = template(
      `<pre><code class="code-PYTHON">import this</code></pre>`
    );

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const target = await htmlAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(html);
  });

  test('code unknown', async () => {
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'block:vu6SK6WJpW',
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
          id: 'block:Tk4gSPocAt',
          flavour: 'affine:surface',
          props: {
            elements: {},
          },
          children: [],
        },
        {
          type: 'block',
          id: 'block:WfnS5ZDCJT',
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
              id: 'block:8hOLxad5Fv',
              flavour: 'affine:code',
              props: {
                language: 'unknown',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'import this',
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

    const html = template(
      `<pre><code class="code-unknown">import this</code></pre>`
    );

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const target = await htmlAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(html);
  });

  test('paragraph', async () => {
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'block:vu6SK6WJpW',
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
          id: 'block:Tk4gSPocAt',
          flavour: 'affine:surface',
          props: {
            elements: {},
          },
          children: [],
        },
        {
          type: 'block',
          id: 'block:WfnS5ZDCJT',
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
              id: 'block:Bdn8Yvqcny',
              flavour: 'affine:paragraph',
              props: {
                type: 'text',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'aaa',
                    },
                  ],
                },
              },
              children: [
                {
                  type: 'block',
                  id: 'block:72SMa5mdLy',
                  flavour: 'affine:paragraph',
                  props: {
                    type: 'text',
                    text: {
                      '$blocksuite:internal:text$': true,
                      delta: [
                        {
                          insert: 'bbb',
                        },
                      ],
                    },
                  },
                  children: [],
                },
                {
                  type: 'block',
                  id: 'block:f-Z6nRrGK_',
                  flavour: 'affine:paragraph',
                  props: {
                    type: 'text',
                    text: {
                      '$blocksuite:internal:text$': true,
                      delta: [
                        {
                          insert: 'ccc',
                        },
                      ],
                    },
                  },
                  children: [
                    {
                      type: 'block',
                      id: 'block:sP3bU52el7',
                      flavour: 'affine:paragraph',
                      props: {
                        type: 'text',
                        text: {
                          '$blocksuite:internal:text$': true,
                          delta: [
                            {
                              insert: 'ddd',
                            },
                          ],
                        },
                      },
                      children: [],
                    },
                    {
                      type: 'block',
                      id: 'block:X_HMxP4wxC',
                      flavour: 'affine:paragraph',
                      props: {
                        type: 'text',
                        text: {
                          '$blocksuite:internal:text$': true,
                          delta: [
                            {
                              insert: 'eee',
                            },
                          ],
                        },
                      },
                      children: [],
                    },
                    {
                      type: 'block',
                      id: 'block:iA34Rb-RvV',
                      flavour: 'affine:paragraph',
                      props: {
                        text: {
                          '$blocksuite:internal:text$': true,
                          delta: [
                            {
                              insert: 'fff',
                            },
                          ],
                        },
                        type: 'text',
                      },
                      children: [],
                    },
                  ],
                },
                {
                  type: 'block',
                  id: 'block:I0Fmz5Nv02',
                  flavour: 'affine:paragraph',
                  props: {
                    type: 'text',
                    text: {
                      '$blocksuite:internal:text$': true,
                      delta: [
                        {
                          insert: 'ggg',
                        },
                      ],
                    },
                  },
                  children: [],
                },
              ],
            },
            {
              type: 'block',
              id: 'block:12lDwMD7ec',
              flavour: 'affine:paragraph',
              props: {
                type: 'text',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'hhh',
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
    const html = template(
      `<div class="affine-paragraph-block-container"><p>aaa</p><div class="affine-block-children-container" style="padding-left: 26px;"><div class="affine-paragraph-block-container"><p>bbb</p><div class="affine-block-children-container" style="padding-left: 26px;"></div></div><div class="affine-paragraph-block-container"><p>ccc</p><div class="affine-block-children-container" style="padding-left: 26px;"><div class="affine-paragraph-block-container"><p>ddd</p><div class="affine-block-children-container" style="padding-left: 26px;"></div></div><div class="affine-paragraph-block-container"><p>eee</p><div class="affine-block-children-container" style="padding-left: 26px;"></div></div><div class="affine-paragraph-block-container"><p>fff</p><div class="affine-block-children-container" style="padding-left: 26px;"></div></div></div></div><div class="affine-paragraph-block-container"><p>ggg</p><div class="affine-block-children-container" style="padding-left: 26px;"></div></div></div></div><div class="affine-paragraph-block-container"><p>hhh</p><div class="affine-block-children-container" style="padding-left: 26px;"></div></div>`
    );

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const target = await htmlAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(html);
  });

  test('bulleted list', async () => {
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'block:vu6SK6WJpW',
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
          id: 'block:Tk4gSPocAt',
          flavour: 'affine:surface',
          props: {
            elements: {},
          },
          children: [],
        },
        {
          type: 'block',
          id: 'block:WfnS5ZDCJT',
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
              id: 'block:imiLDMKSkx',
              flavour: 'affine:list',
              props: {
                type: 'bulleted',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'aaa',
                    },
                  ],
                },
                checked: false,
                collapsed: false,
              },
              children: [
                {
                  type: 'block',
                  id: 'block:kYliRIovvL',
                  flavour: 'affine:list',
                  props: {
                    type: 'bulleted',
                    text: {
                      '$blocksuite:internal:text$': true,
                      delta: [
                        {
                          insert: 'bbb',
                        },
                      ],
                    },
                    checked: false,
                    collapsed: false,
                  },
                  children: [
                    {
                      type: 'block',
                      id: 'block:UyvxA_gqCJ',
                      flavour: 'affine:list',
                      props: {
                        type: 'bulleted',
                        text: {
                          '$blocksuite:internal:text$': true,
                          delta: [
                            {
                              insert: 'ccc',
                            },
                          ],
                        },
                        checked: false,
                        collapsed: false,
                      },
                      children: [],
                    },
                  ],
                },
                {
                  type: 'block',
                  id: 'block:-guNZRm5u1',
                  flavour: 'affine:list',
                  props: {
                    type: 'bulleted',
                    text: {
                      '$blocksuite:internal:text$': true,
                      delta: [
                        {
                          insert: 'ddd',
                        },
                      ],
                    },
                    checked: false,
                    collapsed: false,
                  },
                  children: [],
                },
              ],
            },
            {
              type: 'block',
              id: 'block:B9CaZzQ2CO',
              flavour: 'affine:list',
              props: {
                type: 'bulleted',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'eee',
                    },
                  ],
                },
                checked: false,
                collapsed: false,
              },
              children: [],
            },
          ],
        },
      ],
    };
    const html = template(
      `<ul class="bulleted-list"><li class="affine-list-block-container">aaa<ul class="bulleted-list"><li class="affine-list-block-container">bbb<ul class="bulleted-list"><li class="affine-list-block-container">ccc</li></ul></li><li class="affine-list-block-container">ddd</li></ul></li><li class="affine-list-block-container">eee</li></ul>`
    );

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const target = await htmlAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(html);
  });

  test('different list', async () => {
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'block:vu6SK6WJpW',
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
          id: 'block:Tk4gSPocAt',
          flavour: 'affine:surface',
          props: {
            elements: {},
          },
          children: [],
        },
        {
          type: 'block',
          id: 'block:WfnS5ZDCJT',
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
              id: 'block:imiLDMKSkx',
              flavour: 'affine:list',
              props: {
                type: 'bulleted',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'aaa',
                    },
                  ],
                },
                checked: false,
                collapsed: false,
              },
              children: [],
            },
            {
              type: 'block',
              id: 'block:imiLDMKSkx',
              flavour: 'affine:list',
              props: {
                type: 'todo',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'bbb',
                    },
                  ],
                },
                checked: false,
                collapsed: false,
              },
              children: [],
            },
            {
              type: 'block',
              id: 'block:imiLDMKSkx',
              flavour: 'affine:list',
              props: {
                type: 'bulleted',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'ccc',
                    },
                  ],
                },
                checked: false,
                collapsed: false,
              },
              children: [],
            },
          ],
        },
      ],
    };
    const html = template(
      `<ul class="bulleted-list"><li class="affine-list-block-container">aaa</li></ul><ul style="list-style-type: none; padding-inline-start: 18px;" class="todo-list"><li class="affine-list-block-container"><input type="checkbox"><label style="margin-right: 3px;"></label></input>bbb</li></ul><ul class="bulleted-list"><li class="affine-list-block-container">ccc</li></ul>`
    );

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const target = await htmlAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(html);
  });

  test('code inline', async () => {
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'block:vu6SK6WJpW',
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
          id: 'block:Tk4gSPocAt',
          flavour: 'affine:surface',
          props: {
            elements: {},
          },
          children: [],
        },
        {
          type: 'block',
          id: 'block:WfnS5ZDCJT',
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
              id: 'block:qhpbuss-KN',
              flavour: 'affine:paragraph',
              props: {
                type: 'text',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'aaa ',
                    },
                    {
                      insert: 'bbb',
                      attributes: {
                        code: true,
                      },
                    },
                    {
                      insert: ' ccc',
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
    const html = template(
      `<div class="affine-paragraph-block-container"><p>aaa <code>bbb</code> ccc</p><div class="affine-block-children-container" style="padding-left: 26px;"></div></div>`
    );

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const target = await htmlAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(html);
  });

  test('link', async () => {
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'block:vu6SK6WJpW',
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
          id: 'block:Tk4gSPocAt',
          flavour: 'affine:surface',
          props: {
            elements: {},
          },
          children: [],
        },
        {
          type: 'block',
          id: 'block:WfnS5ZDCJT',
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
              id: 'block:Bdn8Yvqcny',
              flavour: 'affine:paragraph',
              props: {
                type: 'text',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'aaa ',
                    },
                    {
                      insert: 'bbb',
                      attributes: {
                        link: 'https://affine.pro/',
                      },
                    },
                    {
                      insert: ' ccc',
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
    const html = template(
      `<div class="affine-paragraph-block-container"><p>aaa <a href="https://affine.pro/">bbb</a> ccc</p><div class="affine-block-children-container" style="padding-left: 26px;"></div></div>`
    );

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const target = await htmlAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(html);
  });

  test('bold', async () => {
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'block:vu6SK6WJpW',
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
          id: 'block:Tk4gSPocAt',
          flavour: 'affine:surface',
          props: {
            elements: {},
          },
          children: [],
        },
        {
          type: 'block',
          id: 'block:WfnS5ZDCJT',
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
              id: 'block:zxDyvrg1Mh',
              flavour: 'affine:paragraph',
              props: {
                type: 'text',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'aaa',
                    },
                    {
                      insert: 'bbb',
                      attributes: {
                        bold: true,
                      },
                    },
                    {
                      insert: 'ccc',
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

    const html = template(
      `<div class="affine-paragraph-block-container"><p>aaa<strong>bbb</strong>ccc</p><div class="affine-block-children-container" style="padding-left: 26px;"></div></div>`
    );

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const target = await htmlAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(html);
  });

  test('italic', async () => {
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'block:vu6SK6WJpW',
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
          id: 'block:Tk4gSPocAt',
          flavour: 'affine:surface',
          props: {
            elements: {},
          },
          children: [],
        },
        {
          type: 'block',
          id: 'block:WfnS5ZDCJT',
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
              id: 'block:zxDyvrg1Mh',
              flavour: 'affine:paragraph',
              props: {
                type: 'text',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'aaa',
                    },
                    {
                      insert: 'bbb',
                      attributes: {
                        italic: true,
                      },
                    },
                    {
                      insert: 'ccc',
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

    const html = template(
      `<div class="affine-paragraph-block-container"><p>aaa<em>bbb</em>ccc</p><div class="affine-block-children-container" style="padding-left: 26px;"></div></div>`
    );

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const target = await htmlAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(html);
  });

  test('image', async () => {
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'block:WcYcyv-oZY',
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
          id: 'block:zqtuv999Ww',
          flavour: 'affine:surface',
          props: {
            elements: {},
          },
          children: [],
        },
        {
          type: 'block',
          id: 'block:UTUZojv22c',
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
              id: 'block:Gan31s-dYK',
              flavour: 'affine:image',
              props: {
                sourceId: 'YXXTjRmLlNyiOUnHb8nAIvUP6V7PAXhwW9F5_tc2LGs=',
                caption: 'aaa',
                width: 0,
                height: 0,
                index: 'a0',
                xywh: '[0,0,0,0]',
                rotate: 0,
              },
              children: [],
            },
            {
              type: 'block',
              id: 'block:If92CIQiOl',
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
          ],
        },
      ],
    };

    const html = template(
      `<figure class="affine-image-block-container"><img src="assets/YXXTjRmLlNyiOUnHb8nAIvUP6V7PAXhwW9F5_tc2LGs=.blob" alt="YXXTjRmLlNyiOUnHb8nAIvUP6V7PAXhwW9F5_tc2LGs=.blob" title="aaa"></figure><div class="affine-paragraph-block-container"><p></p><div class="affine-block-children-container" style="padding-left: 26px;"></div></div>`
    );

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const blobManager = new MemoryBlobCRUD();
    await blobManager.set(
      'YXXTjRmLlNyiOUnHb8nAIvUP6V7PAXhwW9F5_tc2LGs=',
      new Blob()
    );
    const assets = new AssetsManager({ blob: blobManager });

    const target = await htmlAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
      assets,
    });
    expect(target.file).toBe(html);
  });

  describe('embed link block', () => {
    const embedTestCases = [
      {
        name: 'bookmark',
        flavour: 'affine:bookmark',
        url: 'https://example.com',
        title: 'example',
      },
      {
        name: 'embed github',
        flavour: 'affine:embed-github',
        url: 'https://github.com/toeverything/blocksuite/pull/66666',
        title: 'example github pr title',
      },
      {
        name: 'embed figma',
        flavour: 'affine:embed-figma',
        url: 'https://www.figma.com/file/1234567890',
        title: 'example figma title',
      },
      {
        name: 'embed youtube',
        flavour: 'affine:embed-youtube',
        url: 'https://www.youtube.com/watch?v=1234567890',
        title: 'example youtube title',
      },
      {
        name: 'embed loom',
        flavour: 'affine:embed-loom',
        url: 'https://www.loom.com/share/1234567890',
        title: 'example loom title',
      },
    ];

    for (const testCase of embedTestCases) {
      test(testCase.name, async () => {
        const blockSnapshot: BlockSnapshot = {
          type: 'block',
          id: 'block:vu6SK6WJpW',
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
              id: 'block:Tk4gSPocAt',
              flavour: 'affine:surface',
              props: {
                elements: {},
              },
              children: [],
            },
            {
              type: 'block',
              id: 'block:WfnS5ZDCJT',
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
                  id: 'block:Bdn8Yvqcny',
                  flavour: testCase.flavour,
                  props: {
                    url: testCase.url,
                    title: testCase.title,
                  },
                  children: [],
                },
              ],
            },
          ],
        };

        const html = template(
          `<div class="affine-paragraph-block-container"><a href="${testCase.url}">${testCase.title}</a></div>`
        );

        const htmlAdapter = new HtmlAdapter(createJob(), provider);
        const target = await htmlAdapter.fromBlockSnapshot({
          snapshot: blockSnapshot,
        });
        expect(target.file).toBe(html);
      });
    }
  });

  test('database', async () => {
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'block:vu6SK6WJpW',
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
          id: 'block:Tk4gSPocAt',
          flavour: 'affine:surface',
          props: {
            elements: {},
          },
          children: [],
        },
        {
          type: 'block',
          id: 'block:WfnS5ZDCJT',
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
              id: 'block:8Wb7CSJ9Qe',
              flavour: 'affine:database',
              props: {
                cells: {
                  'block:P_-Wg7Rg9O': {
                    'block:qyo8q9VPWU': {
                      columnId: 'block:qyo8q9VPWU',
                      value: 'TKip9uc7Yx',
                    },
                    'block:5cglrBmAr3': {
                      columnId: 'block:5cglrBmAr3',
                      value: 1702598400000,
                    },
                    'block:8Fa0JQe7WY': {
                      columnId: 'block:8Fa0JQe7WY',
                      value: 1,
                    },
                    'block:5ej6StPuF_': {
                      columnId: 'block:5ej6StPuF_',
                      value: 65,
                    },
                    'block:DPhZ6JBziD': {
                      columnId: 'block:DPhZ6JBziD',
                      value: ['-2_QD3GZT1', '73UrEZWaKk'],
                    },
                    'block:O8dpIDiP7-': {
                      columnId: 'block:O8dpIDiP7-',
                      value: {
                        '$blocksuite:internal:text$': true,
                        delta: [
                          {
                            insert: 'test2',
                            attributes: {
                              link: 'https://google.com',
                            },
                          },
                        ],
                      },
                    },
                    'block:U8lPD59MkF': {
                      columnId: 'block:U8lPD59MkF',
                      value: 'https://google.com',
                    },
                    'block:-DT7B0TafG': {
                      columnId: 'block:-DT7B0TafG',
                      value: true,
                    },
                  },
                  'block:0vhfgcHtPF': {
                    'block:qyo8q9VPWU': {
                      columnId: 'block:qyo8q9VPWU',
                      value: 'F2bgsaE3X2',
                    },
                    'block:O8dpIDiP7-': {
                      columnId: 'block:O8dpIDiP7-',
                      value: {
                        '$blocksuite:internal:text$': true,
                        delta: [
                          {
                            insert: 'test1',
                          },
                        ],
                      },
                    },
                    'block:5cglrBmAr3': {
                      columnId: 'block:5cglrBmAr3',
                      value: 1703030400000,
                    },
                  },
                  'block:b4_02QXMAM': {
                    'block:qyo8q9VPWU': {
                      columnId: 'block:qyo8q9VPWU',
                      value: 'y3O1A2IHHu',
                    },
                  },
                  'block:W_eirvg7EJ': {
                    'block:qyo8q9VPWU': {
                      columnId: 'block:qyo8q9VPWU',
                    },
                  },
                },
                columns: [
                  {
                    type: 'title',
                    name: 'Title',
                    data: {},
                    id: 'block:2VfUaitjf9',
                  },
                  {
                    type: 'select',
                    name: 'Status',
                    data: {
                      options: [
                        {
                          id: 'TKip9uc7Yx',
                          color: 'var(--affine-tag-white)',
                          value: 'TODO',
                        },
                        {
                          id: 'F2bgsaE3X2',
                          color: 'var(--affine-tag-green)',
                          value: 'In Progress',
                        },
                        {
                          id: 'y3O1A2IHHu',
                          color: 'var(--affine-tag-gray)',
                          value: 'Done',
                        },
                      ],
                    },
                    id: 'block:qyo8q9VPWU',
                  },
                  {
                    type: 'date',
                    name: 'Date',
                    data: {},
                    id: 'block:5cglrBmAr3',
                  },
                  {
                    type: 'number',
                    name: 'Number',
                    data: {
                      decimal: 0,
                    },
                    id: 'block:8Fa0JQe7WY',
                  },
                  {
                    type: 'progress',
                    name: 'Progress',
                    data: {},
                    id: 'block:5ej6StPuF_',
                  },
                  {
                    type: 'multi-select',
                    name: 'MultiSelect',
                    data: {
                      options: [
                        {
                          id: '73UrEZWaKk',
                          value: 'test2',
                          color: 'var(--affine-tag-purple)',
                        },
                        {
                          id: '-2_QD3GZT1',
                          value: 'test1',
                          color: 'var(--affine-tag-teal)',
                        },
                      ],
                    },
                    id: 'block:DPhZ6JBziD',
                  },
                  {
                    type: 'rich-text',
                    name: 'RichText',
                    data: {},
                    id: 'block:O8dpIDiP7-',
                  },
                  {
                    type: 'link',
                    name: 'Link',
                    data: {},
                    id: 'block:U8lPD59MkF',
                  },
                  {
                    type: 'checkbox',
                    name: 'Checkbox',
                    data: {},
                    id: 'block:-DT7B0TafG',
                  },
                ],
              },
              children: [
                {
                  type: 'block',
                  id: 'block:P_-Wg7Rg9O',
                  flavour: 'affine:paragraph',
                  props: {
                    type: 'text',
                    text: {
                      '$blocksuite:internal:text$': true,
                      delta: [
                        {
                          insert: 'Task 1',
                        },
                      ],
                    },
                  },
                  children: [],
                },
                {
                  type: 'block',
                  id: 'block:0vhfgcHtPF',
                  flavour: 'affine:paragraph',
                  props: {
                    type: 'text',
                    text: {
                      '$blocksuite:internal:text$': true,
                      delta: [
                        {
                          insert: 'Task 2',
                        },
                      ],
                    },
                  },
                  children: [],
                },
              ],
            },
          ],
        },
      ],
    };
    const html = template(
      '<table><thead><tr><th>Title</th><th>Status</th><th>Date</th><th>Number</th><th>Progress</th><th>MultiSelect</th><th>RichText</th><th>Link</th><th>Checkbox</th></tr></thead><tbody><tr><td>Task 1</td><td>TODO</td><td>2023-12-15</td><td>1</td><td>65</td><td>test1,test2</td><td><a href="https://google.com">test2</a></td><td>https://google.com</td><td>True</td></tr><tr><td>Task 2</td><td>In Progress</td><td>2023-12-20</td><td></td><td></td><td></td><td>test1</td><td></td><td></td></tr></tbody></table>'
    );
    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const target = await htmlAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(html);
  });

  test('linked doc block', async () => {
    const blockSnapShot: BlockSnapshot = {
      type: 'block',
      id: 'VChAZIX7DM',
      flavour: 'affine:page',
      version: 2,
      props: {
        title: {
          '$blocksuite:internal:text$': true,
          delta: [
            {
              insert: 'Test Doc',
            },
          ],
        },
      },
      children: [
        {
          type: 'block',
          id: 'uRj8gejH4d',
          flavour: 'affine:surface',
          version: 5,
          props: {
            elements: {},
          },
          children: [],
        },
        {
          type: 'block',
          id: 'AqFoVDUoW9',
          flavour: 'affine:note',
          version: 1,
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
              id: 'C0sH2Ee6cz-MysVNLNrBt',
              flavour: 'affine:embed-linked-doc',
              props: {
                index: 'a0',
                xywh: '[0,0,0,0]',
                rotate: 0,
                pageId: '4T5ObMgEIMII-4Bexyta1',
                style: 'horizontal',
                caption: null,
                params: {
                  mode: 'page',
                  blockIds: ['abc', '123'],
                  elementIds: ['def', '456'],
                  databaseId: 'deadbeef',
                  databaseRowId: '123',
                },
              },
              children: [],
            },
          ],
        },
      ],
    };

    const middleware: TransformerMiddleware = ({ adapterConfigs }) => {
      adapterConfigs.set('title:4T5ObMgEIMII-4Bexyta1', 'Test Doc');
      adapterConfigs.set('docLinkBaseUrl', 'https://example.com');
    };
    const html = template(
      '<div class="affine-paragraph-block-container"><a href="https://example.com/4T5ObMgEIMII-4Bexyta1?mode=page&#x26;blockIds=abc%2C123&#x26;elementIds=def%2C456&#x26;databaseId=deadbeef&#x26;databaseRowId=123">Test Doc</a></div>'
    );
    const htmlAdapter = new HtmlAdapter(createJob([middleware]), provider);
    const target = await htmlAdapter.fromBlockSnapshot({
      snapshot: blockSnapShot,
    });
    expect(target.file).toBe(html);
  });

  test('synced doc block', async () => {
    // doc -> synced doc block -> deepest synced doc block
    // The deepest synced doc block only export it's title

    const deepestSyncedDocSnapshot: DocSnapshot = {
      type: 'page',
      meta: {
        id: 'deepestSyncedDoc',
        title: 'Deepest Doc',
        createDate: 1715762171116,
        tags: [],
      },
      blocks: {
        type: 'block',
        id: '8WdJmN5FTT',
        flavour: 'affine:page',
        version: 2,
        props: {
          title: {
            '$blocksuite:internal:text$': true,
            delta: [
              {
                insert: 'Deepest Doc',
              },
            ],
          },
        },
        children: [
          {
            type: 'block',
            id: 'zVN1EZFuZe',
            flavour: 'affine:surface',
            version: 5,
            props: {
              elements: {},
            },
            children: [],
          },
          {
            type: 'block',
            id: '2s9sJlphLH',
            flavour: 'affine:note',
            version: 1,
            props: {
              xywh: '[0,0,800,95]',
              background: DefaultTheme.noteBackgrounColor,
              index: 'a0',
              hidden: false,
              displayMode: 'both',
              edgeless: {
                style: {
                  borderRadius: 8,
                  borderSize: 4,
                  borderStyle: 'solid',
                  shadowType: '--affine-note-shadow-box',
                },
              },
            },
            children: [
              {
                type: 'block',
                id: 'vNp5XrR5yw',
                flavour: 'affine:paragraph',
                version: 1,
                props: {
                  type: 'text',
                  text: {
                    '$blocksuite:internal:text$': true,
                    delta: [],
                  },
                },
                children: [],
              },
              {
                type: 'block',
                id: 'JTdfSl1ygZ',
                flavour: 'affine:paragraph',
                version: 1,
                props: {
                  type: 'text',
                  text: {
                    '$blocksuite:internal:text$': true,
                    delta: [
                      {
                        insert: 'Hello, This is deepest doc.',
                      },
                    ],
                  },
                },
                children: [],
              },
            ],
          },
        ],
      },
    };

    const syncedDocSnapshot: DocSnapshot = {
      type: 'page',
      meta: {
        id: 'syncedDoc',
        title: 'Synced Doc',
        createDate: 1719212435051,
        tags: [],
      },
      blocks: {
        type: 'block',
        id: 'AGOahFisBN',
        flavour: 'affine:page',
        version: 2,
        props: {
          title: {
            '$blocksuite:internal:text$': true,
            delta: [
              {
                insert: 'Synced Doc',
              },
            ],
          },
        },
        children: [
          {
            type: 'block',
            id: 'gfVzx5tGpB',
            flavour: 'affine:surface',
            version: 5,
            props: {
              elements: {},
            },
            children: [],
          },
          {
            type: 'block',
            id: 'CzEfaUret4',
            flavour: 'affine:note',
            version: 1,
            props: {
              xywh: '[0,0,800,95]',
              background: '--affine-note-background-blue',
              index: 'a0',
              hidden: false,
              displayMode: 'both',
              edgeless: {
                style: {
                  borderRadius: 0,
                  borderSize: 4,
                  borderStyle: 'none',
                  shadowType: '--affine-note-shadow-sticker',
                },
              },
            },
            children: [
              {
                type: 'block',
                id: 'yFlNufsgke',
                flavour: 'affine:paragraph',
                version: 1,
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
              {
                type: 'block',
                id: 'oMuLcD6XS3',
                flavour: 'affine:paragraph',
                version: 1,
                props: {
                  type: 'h2',
                  text: {
                    '$blocksuite:internal:text$': true,
                    delta: [
                      {
                        insert: 'heading 2',
                      },
                    ],
                  },
                },
                children: [],
              },
              {
                type: 'block',
                id: 'PQ8FhGV6VM',
                flavour: 'affine:paragraph',
                version: 1,
                props: {
                  type: 'text',
                  text: {
                    '$blocksuite:internal:text$': true,
                    delta: [
                      {
                        insert: 'paragraph',
                      },
                    ],
                  },
                },
                children: [],
              },
              {
                type: 'block',
                id: 'sA9paSrdEN',
                flavour: 'affine:paragraph',
                version: 1,
                props: {
                  type: 'text',
                  text: {
                    '$blocksuite:internal:text$': true,
                    delta: [
                      {
                        insert: 'strike',
                        attributes: {
                          strike: true,
                        },
                      },
                    ],
                  },
                },
                children: [],
              },
              {
                type: 'block',
                id: '-3bbVQTvI2',
                flavour: 'affine:embed-synced-doc',
                version: 1,
                props: {
                  index: 'a0',
                  xywh: '[0,0,0,0]',
                  rotate: 0,
                  pageId: 'deepestSyncedDoc',
                  style: 'syncedDoc',
                },
                children: [],
              },
            ],
          },
        ],
      },
    };

    const syncedDocHtml =
      paragraphTemplate('<h1>Heading 1</h1>') +
      paragraphTemplate('<h2>heading 2</h2>') +
      paragraphTemplate('<p>paragraph</p>') +
      paragraphTemplate('<p><del>strike</del></p>');

    const docSnapShot: DocSnapshot = {
      type: 'page',
      meta: {
        id: 'y5nsrywQtr',
        title: 'Test Doc',
        createDate: 1719222172042,
        tags: [],
      },
      blocks: {
        type: 'block',
        id: 'VChAZIX7DM',
        flavour: 'affine:page',
        version: 2,
        props: {
          title: {
            '$blocksuite:internal:text$': true,
            delta: [
              {
                insert: 'Test Doc',
              },
            ],
          },
        },
        children: [
          {
            type: 'block',
            id: 'uRj8gejH4d',
            flavour: 'affine:surface',
            version: 5,
            props: {
              elements: {},
            },
            children: [],
          },
          {
            type: 'block',
            id: 'AqFoVDUoW9',
            flavour: 'affine:note',
            version: 1,
            props: {
              xywh: '[0,0,800,95]',
              background: '--affine-note-background-blue',
              index: 'a0',
              hidden: false,
              displayMode: 'both',
              edgeless: {
                style: {
                  borderRadius: 0,
                  borderSize: 4,
                  borderStyle: 'none',
                  shadowType: '--affine-note-shadow-sticker',
                },
              },
            },
            children: [
              {
                type: 'block',
                id: 'cWBI4UGTqh',
                flavour: 'affine:paragraph',
                version: 1,
                props: {
                  type: 'text',
                  text: {
                    '$blocksuite:internal:text$': true,
                    delta: [
                      {
                        insert: 'Hello',
                      },
                    ],
                  },
                },
                children: [],
              },
              {
                type: 'block',
                id: 'AqFoVxas19',
                flavour: 'affine:embed-synced-doc',
                version: 1,
                props: {
                  index: 'a0',
                  xywh: '[0,0,0,0]',
                  rotate: 0,
                  pageId: 'syncedDoc',
                  style: 'syncedDoc',
                },
                children: [],
              },
              {
                type: 'block',
                id: 'Db976U9v18',
                flavour: 'affine:paragraph',
                version: 1,
                props: {
                  type: 'text',
                  text: {
                    '$blocksuite:internal:text$': true,
                    delta: [
                      {
                        insert: 'World!',
                      },
                    ],
                  },
                },
                children: [],
              },
            ],
          },
        ],
      },
    };

    const docHtml = template(
      paragraphTemplate('<p>Hello</p>') +
        syncedDocHtml +
        '<div class="affine-paragraph-block-container"><p>Deepest Doc</p></div>' +
        paragraphTemplate('<p>World!</p>'),
      'Test Doc'
    );

    const job = createJob([embedSyncedDocMiddleware('content')]);

    // workaround for adding docs to collection
    await job.snapshotToDoc(deepestSyncedDocSnapshot);
    await job.snapshotToDoc(syncedDocSnapshot);
    await job.snapshotToDoc(docSnapShot);

    const mdAdapter = new HtmlAdapter(job, provider);
    const target = await mdAdapter.fromDocSnapshot({
      snapshot: docSnapShot,
    });
    expect(target.file).toBe(docHtml);
  });
});

describe('html to snapshot', () => {
  const template = (html: string) =>
    `
  <!doctype html>
  <html>
  <head>
    <style>
      input[type='checkbox'] {
        display: none;
      }
      label:before {
        background: rgb(30, 150, 235);
        border-radius: 3px;
        height: 16px;
        width: 16px;
        display: inline-block;
        cursor: pointer;
      }
      input[type='checkbox'] + label:before {
        content: '';
        background: rgb(30, 150, 235);
        color: #fff;
        font-size: 16px;
        line-height: 16px;
        text-align: center;
      }
      input[type='checkbox']:checked + label:before {
        content: '✓';
      }
    </style>
  </head>
  <body>
  <!--StartFragment-->
  <!--HtmlTemplate-->
  <!--EndFragment-->

  </body>
  </html>
  `.replace('<!--HtmlTemplate-->', html);

  test('code', async () => {
    const html = template(
      `<pre><code class="code-python"><span style="word-wrap: break-word; color: #81A1C1;">import</span><span style="word-wrap: break-word; color: #D8DEE9FF;"> this</span></code></pre>`
    );

    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'matchesReplaceMap[0]',
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
          id: 'matchesReplaceMap[1]',
          flavour: 'affine:code',
          props: {
            language: 'python',
            wrap: false,
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'import this',
                },
              ],
            },
          },
          children: [],
        },
      ],
    };

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const rawBlockSnapshot = await htmlAdapter.toBlockSnapshot({
      file: html,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('paragraph', async () => {
    const html = template(`<p>aaa</p><p>bbb</p><p>ccc</p><p>ddd</p><p>eee</p>`);

    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'matchesReplaceMap[0]',
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
          id: 'matchesReplaceMap[1]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'aaa',
                },
              ],
            },
          },
          children: [],
        },
        {
          type: 'block',
          id: 'matchesReplaceMap[2]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'bbb',
                },
              ],
            },
          },
          children: [],
        },
        {
          type: 'block',
          id: 'matchesReplaceMap[3]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'ccc',
                },
              ],
            },
          },
          children: [],
        },
        {
          type: 'block',
          id: 'matchesReplaceMap[4]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'ddd',
                },
              ],
            },
          },
          children: [],
        },
        {
          type: 'block',
          id: 'matchesReplaceMap[5]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'eee',
                },
              ],
            },
          },
          children: [],
        },
      ],
    };

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const rawBlockSnapshot = await htmlAdapter.toBlockSnapshot({
      file: html,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('nested list', async () => {
    const html = template(`<ul><li>111<ul><li>222</li></ul></li></ul>`);

    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'matchesReplaceMap[0]',
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
          id: 'matchesReplaceMap[1]',
          flavour: 'affine:list',
          props: {
            type: 'bulleted',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: '111',
                },
              ],
            },
            checked: false,
            collapsed: false,
            order: null,
          },
          children: [
            {
              type: 'block',
              id: 'matchesReplaceMap[2]',
              flavour: 'affine:list',
              props: {
                type: 'bulleted',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: '222',
                    },
                  ],
                },
                checked: false,
                collapsed: false,
                order: null,
              },
              children: [],
            },
          ],
        },
      ],
    };

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const rawBlockSnapshot = await htmlAdapter.toBlockSnapshot({
      file: html,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('p in list', async () => {
    const html = template(`<ol><li><p>p in list</p></li></ol>`);

    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'matchesReplaceMap[0]',
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
          id: 'matchesReplaceMap[1]',
          flavour: 'affine:list',
          props: {
            type: 'numbered',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'p in list',
                },
              ],
            },
            checked: false,
            collapsed: false,
            order: null,
          },
          children: [],
        },
      ],
    };

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const rawBlockSnapshot = await htmlAdapter.toBlockSnapshot({
      file: html,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('iframe', async () => {
    const html = template(
      `<iframe width="560" height="315" src="https://www.youtube.com/embed/QDsd0nyzwz0?start=&amp;end=" title="YouTube video player" frameborder="0" allow="fullscreen; autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin"></iframe>`
    );

    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'matchesReplaceMap[0]',
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
          id: 'matchesReplaceMap[1]',
          flavour: 'affine:embed-youtube',
          props: {
            url: 'https://www.youtube.com/watch?v=QDsd0nyzwz0',
          },
          children: [],
        },
      ],
    };

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const rawBlockSnapshot = await htmlAdapter.toBlockSnapshot({
      file: html,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('wrap', async () => {
    const html = template(
      `<p>a\n aa</p><p>b\t bb</p><p>c  cc</p><p>ddd</p><p>eee</p>`
    );

    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'matchesReplaceMap[0]',
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
          id: 'matchesReplaceMap[1]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'a aa',
                },
              ],
            },
          },
          children: [],
        },
        {
          type: 'block',
          id: 'matchesReplaceMap[2]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'b bb',
                },
              ],
            },
          },
          children: [],
        },
        {
          type: 'block',
          id: 'matchesReplaceMap[3]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'c cc',
                },
              ],
            },
          },
          children: [],
        },
        {
          type: 'block',
          id: 'matchesReplaceMap[4]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'ddd',
                },
              ],
            },
          },
          children: [],
        },
        {
          type: 'block',
          id: 'matchesReplaceMap[5]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'eee',
                },
              ],
            },
          },
          children: [],
        },
      ],
    };

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const rawBlockSnapshot = await htmlAdapter.toBlockSnapshot({
      file: html,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('should preserve space in p', async () => {
    const html = template(
      `<p>A <b>bold text</b> followed by a <i>italic text</i></p>`
    );

    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'matchesReplaceMap[0]',
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
          id: 'matchesReplaceMap[1]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'A ',
                },
                {
                  insert: 'bold text',
                  attributes: {
                    bold: true,
                  },
                },
                {
                  insert: ' followed by a ',
                },
                {
                  insert: 'italic text',
                  attributes: {
                    italic: true,
                  },
                },
              ],
            },
          },
          children: [],
        },
      ],
    };

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const rawBlockSnapshot = await htmlAdapter.toBlockSnapshot({
      file: html,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('span nested in p', async () => {
    const html = template(
      `<p><span>aaa</span><span>bbb</span><span>ccc</span></p>`
    );

    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'matchesReplaceMap[0]',
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
          id: 'matchesReplaceMap[1]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'aaabbbccc',
                },
              ],
            },
          },
          children: [],
        },
      ],
    };

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const rawBlockSnapshot = await htmlAdapter.toBlockSnapshot({
      file: html,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('span nested in div', async () => {
    const html = template(
      `<div><span>aaa</span><span>bbb</span><span>ccc</span></div>`
    );

    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'matchesReplaceMap[0]',
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
          id: 'matchesReplaceMap[1]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'aaabbbccc',
                },
              ],
            },
          },
          children: [],
        },
      ],
    };

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const rawBlockSnapshot = await htmlAdapter.toBlockSnapshot({
      file: html,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('inline div', async () => {
    const html = template(
      `<span>aaa</span><a href="https://www.google.com/">bbb</a><div style="display:inline">ccc</div>`
    );

    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'matchesReplaceMap[0]',
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
          id: 'matchesReplaceMap[1]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'aaa',
                },
                {
                  insert: 'bbb',
                  attributes: {
                    link: 'https://www.google.com/',
                  },
                },
                {
                  insert: 'ccc',
                },
              ],
            },
          },
          children: [],
        },
      ],
    };

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const rawBlockSnapshot = await htmlAdapter.toBlockSnapshot({
      file: html,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('flex div', async () => {
    const html = template(
      `<div style="display:flex"><span>aaa</span><a href="https://www.google.com/">bbb</a><div>ccc</div></div>`
    );

    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'matchesReplaceMap[0]',
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
          id: 'matchesReplaceMap[1]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'aaa',
                },
                {
                  insert: 'bbb',
                  attributes: {
                    link: 'https://www.google.com/',
                  },
                },
                {
                  insert: 'ccc',
                },
              ],
            },
          },
          children: [],
        },
      ],
    };

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const rawBlockSnapshot = await htmlAdapter.toBlockSnapshot({
      file: html,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('span inside h1', async () => {
    const html = template(`<h1><span>aaa</span></h1>`);
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'matchesReplaceMap[0]',
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
          id: 'matchesReplaceMap[1]',
          flavour: 'affine:paragraph',
          props: {
            type: 'h1',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'aaa',
                },
              ],
            },
          },
          children: [],
        },
      ],
    };

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const rawBlockSnapshot = await htmlAdapter.toBlockSnapshot({
      file: html,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('p in ancestor', async () => {
    const html = template(`<p><b><span>aaa</span></b></p>`);
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'matchesReplaceMap[0]',
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
          id: 'matchesReplaceMap[1]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  attributes: {
                    bold: true,
                  },
                  insert: 'aaa',
                },
              ],
            },
          },
          children: [],
        },
      ],
    };

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const rawBlockSnapshot = await htmlAdapter.toBlockSnapshot({
      file: html,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('block level element in b should not be treated as inline', async () => {
    const html = template(`<b><p><span>aaa</span></p></b>`);
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'matchesReplaceMap[0]',
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
          id: 'matchesReplaceMap[1]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'aaa',
                },
              ],
            },
          },
          children: [],
        },
      ],
    };

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const rawBlockSnapshot = await htmlAdapter.toBlockSnapshot({
      file: html,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  describe('strong element', () => {
    test('should not be bold when font-weight is normal', async () => {
      const html = template(`<span style="font-weight: normal;">aaa</span>`);
      const blockSnapshot: BlockSnapshot = {
        type: 'block',
        id: 'matchesReplaceMap[0]',
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
            id: 'matchesReplaceMap[1]',
            flavour: 'affine:paragraph',
            props: {
              type: 'text',
              text: {
                '$blocksuite:internal:text$': true,
                delta: [
                  {
                    insert: 'aaa',
                  },
                ],
              },
            },
            children: [],
          },
        ],
      };

      const htmlAdapter = new HtmlAdapter(createJob(), provider);
      const rawBlockSnapshot = await htmlAdapter.toBlockSnapshot({
        file: html,
      });
      expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
    });

    test('should be bold when font-weight is bold or 500-900 ', async () => {
      const html = template(
        `<p><span style="font-weight: bold;">aaa</span><span style="font-weight: 100;">aaa</span><span style="font-weight: 500;">bbb</span><span style="font-weight: 200;">bbb</span><span style="font-weight: 600;">ccc</span><span style="font-weight: 300;">ccc</span><span style="font-weight: 700;">ddd</span></p>`
      );
      const blockSnapshot: BlockSnapshot = {
        type: 'block',
        id: 'matchesReplaceMap[0]',
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
            id: 'matchesReplaceMap[1]',
            flavour: 'affine:paragraph',
            props: {
              type: 'text',
              text: {
                '$blocksuite:internal:text$': true,
                delta: [
                  {
                    attributes: {
                      bold: true,
                    },
                    insert: 'aaa',
                  },
                  {
                    insert: 'aaa',
                  },
                  {
                    attributes: {
                      bold: true,
                    },
                    insert: 'bbb',
                  },
                  {
                    insert: 'bbb',
                  },
                  {
                    attributes: {
                      bold: true,
                    },
                    insert: 'ccc',
                  },
                  {
                    insert: 'ccc',
                  },
                  {
                    attributes: {
                      bold: true,
                    },
                    insert: 'ddd',
                  },
                ],
              },
            },
            children: [],
          },
        ],
      };

      const htmlAdapter = new HtmlAdapter(createJob(), provider);
      const rawBlockSnapshot = await htmlAdapter.toBlockSnapshot({
        file: html,
      });
      expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
    });
  });

  test('should be italic when tag is i or em or span with style font-style: italic', async () => {
    const html = template(
      `<p><i>aaa</i><span>aaa</span><em>bbb</em><span>bbb</span><span style="font-style: italic;">ccc</span></p>`
    );
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'matchesReplaceMap[0]',
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
          id: 'matchesReplaceMap[1]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  attributes: {
                    italic: true,
                  },
                  insert: 'aaa',
                },
                {
                  insert: 'aaa',
                },
                {
                  attributes: {
                    italic: true,
                  },
                  insert: 'bbb',
                },
                {
                  insert: 'bbb',
                },
                {
                  attributes: {
                    italic: true,
                  },
                  insert: 'ccc',
                },
              ],
            },
          },
          children: [],
        },
      ],
    };

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const rawBlockSnapshot = await htmlAdapter.toBlockSnapshot({
      file: html,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('should be underline when tag is u or span with style text-decoration: underline', async () => {
    const html = template(
      `<p><u>aaa</u><span>aaa</span><span style="text-decoration: underline;">bbb</span></p>`
    );
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'matchesReplaceMap[0]',
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
          id: 'matchesReplaceMap[1]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  attributes: {
                    underline: true,
                  },
                  insert: 'aaa',
                },
                {
                  insert: 'aaa',
                },
                {
                  attributes: {
                    underline: true,
                  },
                  insert: 'bbb',
                },
              ],
            },
          },
          children: [],
        },
      ],
    };

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const rawBlockSnapshot = await htmlAdapter.toBlockSnapshot({
      file: html,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('should be strike when tag is del or span with style text-decoration: line-through', async () => {
    const html = template(
      `<p><del>aaa</del><span>aaa</span><span style="text-decoration: line-through;">bbb</span></p>`
    );
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'matchesReplaceMap[0]',
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
          id: 'matchesReplaceMap[1]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  attributes: {
                    strike: true,
                  },
                  insert: 'aaa',
                },
                {
                  insert: 'aaa',
                },
                {
                  attributes: {
                    strike: true,
                  },
                  insert: 'bbb',
                },
              ],
            },
          },
          children: [],
        },
      ],
    };

    const htmlAdapter = new HtmlAdapter(createJob(), provider);
    const rawBlockSnapshot = await htmlAdapter.toBlockSnapshot({
      file: html,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });
});
