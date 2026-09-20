import { existsSync, readdirSync } from 'node:fs';
import { join, parse } from 'node:path';

import type { DefaultTheme } from 'vitepress';

export const guide: DefaultTheme.NavItem[] = [
  {
    text: 'Introduction',
    items: [
      { text: 'Overview', link: 'guide/overview' },
      { text: 'Quick Start', link: 'guide/quick-start' },
    ],
  },
  {
    text: 'Framework Guide',
    items: [
      { text: 'Component Types', link: 'guide/component-types' },
      {
        text: 'Working with Block Tree',
        // @ts-expect-error nested items are supported by VitePress at runtime
        link: 'guide/working-with-block-tree',
        items: [
          {
            text: 'Block Tree Basics',
            link: 'guide/working-with-block-tree#block-tree-basics',
          },
          {
            text: 'Block Tree in Editor',
            link: 'guide/working-with-block-tree#block-tree-in-editor',
          },
          {
            text: 'Selecting Blocks',
            link: 'guide/working-with-block-tree#selecting-blocks',
          },
          {
            text: 'Service and Commands',
            link: 'guide/working-with-block-tree#service-and-commands',
          },
          {
            text: 'Defining New Blocks',
            link: 'guide/working-with-block-tree#defining-new-blocks',
          },
        ],
      },
      { text: 'Data Synchronization', link: 'guide/data-synchronization' },
    ],
  },
  {
    text: 'Framework Handbook',
    items: [
      {
        text: '<code>block-std</code>',
        items: [
          {
            text: 'Block Spec',
            link: 'guide/block-spec',
            // @ts-expect-error nested items are supported by VitePress at runtime
            items: [
              { text: 'Block Schema', link: 'guide/block-schema' },
              { text: 'Block Service', link: 'guide/block-service' },
              { text: 'Block View', link: 'guide/block-view' },
              { text: 'Block Widgets', link: 'guide/block-widgets' },
            ],
          },
          {
            text: 'Selection',
            link: 'guide/selection',
          },
          { text: 'Event', link: 'guide/event' },
          { text: 'Command', link: 'guide/command' },
        ],
      },
      {
        text: '<code>store</code>',
        items: [
          { text: 'Doc', link: 'guide/store#doc' },
          { text: 'DocCollection', link: 'guide/store#doccollection' },
          { text: 'Slot', link: 'guide/slot' },
          { text: 'Adapter', link: 'guide/adapter' },
        ],
      },
      {
        text: '<code>inline</code>',
        link: 'guide/inline',
      },
    ],
  },
  {
    text: 'Developing BlockSuite',
    items: [
      {
        text: 'Building Packages',
        link: '//github.com/toeverything/blocksuite/blob/master/BUILDING.md',
      },
      {
        text: 'Running Tests',
        link: '//github.com/toeverything/blocksuite/blob/master/BUILDING.md#testing',
      },
    ],
  },
];

export const reference: DefaultTheme.NavItem[] = [
  {
    text: 'API Reference',
    items: getApiReferenceItems(),
  },
];

function getApiReferenceItems(): DefaultTheme.NavItem[] {
  const apiDir = join(process.cwd(), 'api', '@blocksuite');

  if (!existsSync(apiDir)) {
    return [
      { text: '@blocksuite/store', link: 'api/@blocksuite/store' },
      { text: '@blocksuite/std', link: 'api/@blocksuite/std/index' },
      { text: '@blocksuite/affine', link: 'api/@blocksuite/affine' },
    ];
  }

  return readdirSync(apiDir, { withFileTypes: true })
    .flatMap(entry => {
      if (entry.isFile() && entry.name.endsWith('.md')) {
        const name = parse(entry.name).name;
        return [
          { text: `@blocksuite/${name}`, link: `api/@blocksuite/${name}` },
        ];
      }

      if (entry.isDirectory()) {
        const indexPath = join(apiDir, entry.name, 'index.md');

        if (existsSync(indexPath)) {
          return [
            {
              text: `@blocksuite/${entry.name}`,
              link: `api/@blocksuite/${entry.name}/index`,
            },
          ];
        }
      }

      return [];
    })
    .sort((a, b) => a.text.localeCompare(b.text));
}

export const components: DefaultTheme.NavItem[] = [
  {
    text: 'Introduction',
    items: [{ text: 'Overview', link: 'components/overview' }],
  },
  {
    text: 'Editors',
    items: [
      { text: '📝 Page Editor', link: 'components/editors/page-editor' },
      {
        text: '🎨 Edgeless Editor',
        // @ts-expect-error nested items are supported by VitePress at runtime
        link: 'components/editors/edgeless-editor',
        items: [
          {
            text: 'Data Structure',
            link: 'components/editors/edgeless-data-structure',
          },
        ],
      },
    ],
  },
  {
    text: 'Blocks',
    items: [
      {
        text: 'Regular Blocks',
        items: [
          { text: 'Root Block', link: 'components/blocks/root-block' },
          { text: 'Note Block', link: 'components/blocks/note-block' },
          {
            text: 'Paragraph Block',
            link: 'components/blocks/paragraph-block',
          },
          { text: 'List Block', link: 'components/blocks/list-block' },
          { text: 'Code Block', link: 'components/blocks/code-block' },
          { text: 'Image Block', link: 'components/blocks/image-block' },
          {
            text: 'Attachment Block',
            link: 'components/blocks/attachment-block',
          },
          { text: 'Divider Block', link: 'components/blocks/divider-block' },
        ],
      },
      {
        text: 'Advanced Blocks',
        items: [
          { text: 'Surface Block', link: 'components/blocks/surface-block' },
          {
            text: 'Database Block',
            link: 'components/blocks/database-block',
          },
          { text: 'Frame Block', link: 'components/blocks/frame-block' },
          { text: 'Link Blocks', link: 'components/blocks/link-blocks' },
          { text: 'Embed Blocks', link: 'components/blocks/embed-blocks' },
        ],
      },
    ],
  },
  {
    text: 'Widgets 🚧',
    items: [
      { text: 'Slash Menu', link: 'components/widgets/slash-menu' },
      { text: 'Format Bar', link: 'components/widgets/format-bar' },
      { text: 'Drag Handle', link: 'components/widgets/drag-handle' },
    ],
  },
  {
    text: 'Fragments 🚧',
    items: [
      { text: 'Doc Title', link: 'components/fragments/doc-title' },
      { text: 'Outline Panel', link: 'components/fragments/outline-panel' },
      { text: 'Frame Panel', link: 'components/fragments/frame-panel' },
      { text: 'Copilot Panel', link: 'components/fragments/copilot-panel' },
      {
        text: 'Bi-Directional Link Panel',
        link: 'components/fragments/bi-directional-link-panel',
      },
    ],
  },
];
