import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import {
  BearTransformer,
  commitImportBatchToWorkspace,
  type ImportBatch,
  MarkdownTransformer,
  NotionHtmlTransformer,
  ObsidianTransformer,
} from '@blocksuite/affine/widgets/linked-doc';
import {
  DefaultTheme,
  NoteDisplayMode,
  TableModelFlavour,
} from '@blocksuite/affine-model';
import {
  CalloutAdmonitionType,
  CalloutExportStyle,
  calloutMarkdownExportMiddleware,
  docLinkBaseURLMiddleware,
  embedSyncedDocMiddleware,
  MarkdownAdapter,
  titleMiddleware,
} from '@blocksuite/affine-shared/adapters';
import type { AffineTextAttributes } from '@blocksuite/affine-shared/types';
import type {
  BlockSnapshot,
  DeltaInsert,
  DocSnapshot,
  SliceSnapshot,
  Store,
  TransformerMiddleware,
} from '@blocksuite/store';
import { AssetsManager, MemoryBlobCRUD, Schema } from '@blocksuite/store';
import { TestWorkspace } from '@blocksuite/store/test';
import * as fflate from 'fflate';
import { describe, expect, test } from 'vitest';

import { AffineSchemas } from '../../schemas.js';
import { createJob } from '../utils/create-job.js';
import { getProvider } from '../utils/get-provider.js';
import { nanoidReplacement } from '../utils/nanoid-replacement.js';
import { testStoreExtensions } from '../utils/store.js';

const provider = getProvider();

function withRelativePath(file: File, relativePath: string): File {
  Object.defineProperty(file, 'webkitRelativePath', {
    value: relativePath,
    writable: false,
  });
  return file;
}

function markdownFixture(relativePath: string): File {
  return withRelativePath(
    new File(
      [
        readFileSync(
          resolve(import.meta.dirname, 'fixtures/obsidian', relativePath),
          'utf8'
        ),
      ],
      basename(relativePath),
      { type: 'text/markdown' }
    ),
    `vault/${relativePath}`
  );
}

function zipBytes(entries: Record<string, string | Uint8Array>) {
  return fflate.zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([path, content]) => [
        path,
        typeof content === 'string' ? fflate.strToU8(content) : content,
      ])
    )
  );
}

function zipFixture(entries: Record<string, string | Uint8Array>) {
  const zipped = zipBytes(entries);
  const buffer = new ArrayBuffer(zipped.byteLength);
  new Uint8Array(buffer).set(zipped);

  return new Blob([buffer], { type: 'application/zip' });
}

async function commitPlannedImport<T extends { batch: ImportBatch }>(
  collection: TestWorkspace,
  schema: Schema,
  planned: T
) {
  const committed = await commitImportBatchToWorkspace(
    collection,
    schema,
    planned.batch
  );
  return {
    ...planned,
    ...committed,
    docIds: committed.docIds,
  };
}

function exportSnapshot(doc: Store): DocSnapshot {
  const job = doc.getTransformer([
    docLinkBaseURLMiddleware(doc.workspace.id),
    titleMiddleware(doc.workspace.meta.docMetas),
  ]);
  const snapshot = job.docToSnapshot(doc);
  expect(snapshot).toBeTruthy();
  return snapshot!;
}

function noteSnapshotByTitle(collection: TestWorkspace, title: string) {
  const meta = collection.meta.docMetas.find(meta => meta.title === title);
  expect(meta).toBeTruthy();
  const doc = collection.getDoc(meta!.id)?.getStore({ id: meta!.id });
  expect(doc).toBeTruthy();
  const snapshot = exportSnapshot(doc!);
  return snapshot.blocks.children.find(
    block => block.flavour === 'affine:note'
  );
}

function normalizeDeltaForSnapshot(
  delta: DeltaInsert<AffineTextAttributes>[],
  titleById: ReadonlyMap<string, string>
) {
  return delta.map(item => {
    const normalized: Record<string, unknown> = {
      insert: item.insert,
    };

    if (item.attributes?.link) {
      normalized.link = item.attributes.link;
    }

    if (item.attributes?.reference?.type === 'LinkedPage') {
      normalized.reference = {
        type: 'LinkedPage',
        page: titleById.get(item.attributes.reference.pageId) ?? '<missing>',
        ...(item.attributes.reference.title
          ? { title: item.attributes.reference.title }
          : {}),
      };
    }

    if (item.attributes?.footnote) {
      const reference = item.attributes.footnote.reference;
      normalized.footnote = {
        label: item.attributes.footnote.label,
        reference:
          reference.type === 'doc'
            ? {
                type: 'doc',
                page: reference.docId
                  ? (titleById.get(reference.docId) ?? '<missing>')
                  : '<missing>',
              }
            : {
                type: reference.type,
                ...(reference.title ? { title: reference.title } : {}),
                ...(reference.fileName ? { fileName: reference.fileName } : {}),
              },
      };
    }

    return normalized;
  });
}

function simplifyBlockForSnapshot(
  block: BlockSnapshot,
  titleById: ReadonlyMap<string, string>
): Record<string, unknown> {
  const simplified: Record<string, unknown> = {
    flavour: block.flavour,
  };

  if (block.flavour === 'affine:paragraph' || block.flavour === 'affine:list') {
    simplified.type = block.props.type;
    const text = block.props.text as
      | { delta?: DeltaInsert<AffineTextAttributes>[] }
      | undefined;
    simplified.delta = normalizeDeltaForSnapshot(text?.delta ?? [], titleById);
  }

  if (block.flavour === 'affine:callout') {
    simplified.emoji = block.props.emoji;
  }

  if (block.flavour === 'affine:attachment') {
    simplified.name = block.props.name;
    simplified.style = block.props.style;
  }

  if (block.flavour === 'affine:image') {
    simplified.sourceId = '<asset>';
  }

  const children = (block.children ?? [])
    .filter(child => child.flavour !== 'affine:surface')
    .map(child => simplifyBlockForSnapshot(child, titleById));
  if (children.length) {
    simplified.children = children;
  }

  return simplified;
}

function snapshotDocByTitle(
  collection: TestWorkspace,
  title: string,
  titleById: ReadonlyMap<string, string>
) {
  const meta = collection.meta.docMetas.find(meta => meta.title === title);
  expect(meta).toBeTruthy();
  const doc = collection.getDoc(meta!.id)?.getStore({ id: meta!.id });
  expect(doc).toBeTruthy();
  return simplifyBlockForSnapshot(exportSnapshot(doc!).blocks, titleById);
}

function titleMap(collection: TestWorkspace) {
  return new Map(
    collection.meta.docMetas.map(meta => [meta.id, meta.title ?? '<untitled>'])
  );
}

function collectSimplifiedDeltas(
  block: Record<string, unknown>
): Record<string, unknown>[] {
  const deltas = Array.isArray(block.delta)
    ? (block.delta as Record<string, unknown>[])
    : [];
  const childDeltas = Array.isArray(block.children)
    ? (block.children as Record<string, unknown>[]).flatMap(child =>
        collectSimplifiedDeltas(child)
      )
    : [];

  return [...deltas, ...childDeltas];
}

function collectSnapshotDeltas(
  block: BlockSnapshot
): DeltaInsert<AffineTextAttributes>[] {
  const text = block.props.text as
    | { delta?: DeltaInsert<AffineTextAttributes>[] }
    | undefined;
  return [
    ...(text?.delta ?? []),
    ...(block.children ?? []).flatMap(child => collectSnapshotDeltas(child)),
  ];
}

function folderChild(
  folder: { children: Map<string, unknown> } | undefined,
  name: string
) {
  return folder?.children.get(name) as
    | { children: Map<string, unknown>; pageId?: string; icon?: unknown }
    | undefined;
}

describe('snapshot to markdown', () => {
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

    const markdown = '```python\nimport this\n```\n';

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const target = await mdAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(markdown);
  });

  test('imports frontmatter metadata into doc meta', async () => {
    const schema = new Schema().register(AffineSchemas);
    const collection = new TestWorkspace();
    collection.storeExtensions = testStoreExtensions;
    collection.meta.initialize();

    const markdown = `---
title: Web developer
created: 2018-04-12T09:51:00
updated: 2018-04-12T10:00:00
tags: [a, b]
favorite: true
---
Hello world
`;

    const docId = await MarkdownTransformer.importMarkdownToDoc({
      collection,
      schema,
      markdown,
      fileName: 'fallback-title',
      extensions: testStoreExtensions,
    });

    expect(docId).toBeTruthy();
    const meta = collection.meta.getDocMeta(docId!);
    expect(meta?.title).toBe('Web developer');
    expect(meta?.createDate).toBe(Date.parse('2018-04-12T09:51:00'));
    expect(meta?.updatedDate).toBe(Date.parse('2018-04-12T10:00:00'));
    expect(meta?.favorite).toBe(true);
    expect(meta?.tags).toEqual(['a', 'b']);
  });

  test('preserves list text inside blockquotes without list blocks', async () => {
    const markdown = `> **Shopping List:**
> - Apples
> - Bananas
> - Oranges
`;
    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const snapshot = await mdAdapter.toDocSnapshot({
      file: markdown,
      assets: new AssetsManager({ blob: new MemoryBlobCRUD() }),
    });

    expect(simplifyBlockForSnapshot(snapshot.blocks, new Map())).toMatchObject({
      children: [
        {
          flavour: 'affine:note',
          children: [
            {
              flavour: 'affine:paragraph',
              type: 'quote',
              delta: [
                { insert: 'Shopping List:' },
                { insert: '\n' },
                { insert: '- ' },
                { insert: 'Apples' },
                { insert: '\n' },
                { insert: '- ' },
                { insert: 'Bananas' },
                { insert: '\n' },
                { insert: '- ' },
                { insert: 'Oranges' },
              ],
            },
          ],
        },
      ],
    });

    const exported = await mdAdapter.fromDocSnapshot({
      snapshot,
      assets: new AssetsManager({ blob: new MemoryBlobCRUD() }),
    });
    expect(exported.file).toContain('> **Shopping List:**');
    expect(exported.file).toContain('> \\- Apples');
    expect(exported.file).toContain('> \\- Bananas');
    expect(exported.file).toContain('> \\- Oranges');
  });

  test('imports notion markdown zip titles and folder names', async () => {
    const schema = new Schema().register(AffineSchemas);
    const collection = new TestWorkspace();
    collection.storeExtensions = testStoreExtensions;
    collection.meta.initialize();

    const imported = zipFixture({
      'Notion Export/Workspace 11111111111111111111111111111111.md':
        '# Workspace\nRoot body',
      'Notion Export/Workspace 11111111111111111111111111111111/Nested Page 22222222222222222222222222222222.md':
        '# Nested Page\nNested body',
    });

    const { docIds, folderHierarchy } = await commitPlannedImport(
      collection,
      schema,
      await MarkdownTransformer.planNotionMarkdownZip({
        collection,
        schema,
        imported,
        extensions: testStoreExtensions,
      })
    );

    expect(docIds).toHaveLength(2);
    expect(
      collection.meta.docMetas
        .map(meta => meta.title)
        .sort((a, b) => (a ?? '').localeCompare(b ?? ''))
    ).toEqual(['Nested Page', 'Workspace']);

    const nestedNote = noteSnapshotByTitle(collection, 'Nested Page');
    expect(JSON.stringify(nestedNote)).toContain('Nested body');
    expect(JSON.stringify(nestedNote)).not.toContain('Nested Page');

    const [folder] = [...(folderHierarchy?.children.values() ?? [])];
    expect(folder?.name).toBe('Notion Export');
    const workspaceMeta = collection.meta.docMetas.find(
      meta => meta.title === 'Workspace'
    );
    expect([...folder!.children.values()]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pageId: workspaceMeta?.id }),
      ])
    );
    const workspaceFolder = [...folder!.children.values()].find(
      child => child.name === 'Workspace'
    );
    const nestedMeta = collection.meta.docMetas.find(
      meta => meta.title === 'Nested Page'
    );
    expect([...workspaceFolder!.children.values()]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pageId: nestedMeta?.id }),
      ])
    );
  });

  test('imports notion markdown zip folders with CJK names', async () => {
    const schema = new Schema().register(AffineSchemas);
    const collection = new TestWorkspace();
    collection.storeExtensions = testStoreExtensions;
    collection.meta.initialize();

    const imported = zipFixture({
      'Export/工作 11111111111111111111111111111111.md': '# 工作\nRoot body',
      'Export/工作 11111111111111111111111111111111/SDK架构 22222222222222222222222222222222.md':
        '# SDK架构\nNested body',
    });

    const { folderHierarchy } = await commitPlannedImport(
      collection,
      schema,
      await MarkdownTransformer.planNotionMarkdownZip({
        collection,
        schema,
        imported,
        extensions: testStoreExtensions,
      })
    );

    const [rootFolder] = [...(folderHierarchy?.children.values() ?? [])];
    expect(rootFolder?.name).toBe('Export');
    const workFolder = [...(rootFolder?.children.values() ?? [])].find(
      child => child.name === '工作'
    );
    expect(workFolder?.name).toBe('工作');
    expect([...workFolder!.children.values()]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ pageId: expect.any(String) }),
      ])
    );
  });

  test('imports notion markdown zip title from frontmatter when heading is absent', async () => {
    const schema = new Schema().register(AffineSchemas);
    const collection = new TestWorkspace();
    collection.storeExtensions = testStoreExtensions;
    collection.meta.initialize();

    const imported = zipFixture({
      'Export/Fallback 11111111111111111111111111111111.md':
        '---\ntitle: Frontmatter Title\n---\nBody',
    });

    const { docIds } = await commitPlannedImport(
      collection,
      schema,
      await MarkdownTransformer.planNotionMarkdownZip({
        collection,
        schema,
        imported,
        extensions: testStoreExtensions,
      })
    );

    expect(docIds).toHaveLength(1);
    expect(collection.meta.getDocMeta(docIds[0])?.title).toBe(
      'Frontmatter Title'
    );
  });

  test('imports markdown zip relative doc links as linked pages', async () => {
    const schema = new Schema().register(AffineSchemas);
    const collection = new TestWorkspace();
    collection.storeExtensions = testStoreExtensions;
    collection.meta.initialize();

    const imported = zipFixture({
      'entry.md': [
        '[引用](./test/2.md)',
        '[missing](./missing.md)',
        '[external](https://example.com/test.md)',
      ].join('\n\n'),
      'test/2.md': 'target page',
    });

    const { docIds } = await commitPlannedImport(
      collection,
      schema,
      await MarkdownTransformer.planMarkdownZip({
        collection,
        schema,
        imported,
        extensions: testStoreExtensions,
      })
    );
    expect(docIds).toHaveLength(2);

    const titleById = new Map(
      collection.meta.docMetas.map(meta => [
        meta.id,
        meta.title ?? '<untitled>',
      ])
    );
    const entryDeltas = collectSimplifiedDeltas(
      snapshotDocByTitle(collection, 'entry', titleById)
    );

    expect(entryDeltas).toContainEqual({
      insert: ' ',
      reference: {
        type: 'LinkedPage',
        page: '2',
        title: '引用',
      },
    });
    expect(entryDeltas).toContainEqual({
      insert: 'missing',
      link: './missing.md',
    });
    expect(entryDeltas).toContainEqual({
      insert: 'external',
      link: 'https://example.com/test.md',
    });
  });

  test('imports markdown zip assets, nested zip, CJK paths, and duplicate names', async () => {
    const schema = new Schema().register(AffineSchemas);
    const collection = new TestWorkspace();
    collection.storeExtensions = testStoreExtensions;
    collection.meta.initialize();

    const imported = zipFixture({
      '入口.md':
        '![logo](./assets/logo.png)\n[同名](./folder/duplicate.md)\n![archive](./nested.zip)',
      'assets/logo.png': new Uint8Array([137, 80, 78, 71]),
      'folder/duplicate.md': 'folder duplicate',
      'other/duplicate.md': 'other duplicate',
      'nested.zip': zipBytes({
        'ignored.md': 'nested markdown should stay an attachment',
      }),
    });

    const { docIds, folderHierarchy } = await commitPlannedImport(
      collection,
      schema,
      await MarkdownTransformer.planMarkdownZip({
        collection,
        schema,
        imported,
        extensions: testStoreExtensions,
      })
    );

    expect(docIds).toHaveLength(3);
    expect(
      collection.meta.docMetas
        .map(meta => meta.title)
        .sort((a, b) => (a ?? '').localeCompare(b ?? ''))
    ).toEqual(['duplicate', 'duplicate', '入口']);

    const titles = titleMap(collection);
    const entry = snapshotDocByTitle(collection, '入口', titles);
    expect(JSON.stringify(entry)).toContain('"sourceId":"<asset>"');
    const entrySnapshot = exportSnapshot(
      collection
        .getDoc(
          collection.meta.docMetas.find(meta => meta.title === '入口')!.id
        )!
        .getStore({
          id: collection.meta.docMetas.find(meta => meta.title === '入口')!.id,
        })
    );
    const linkedPageDelta = collectSnapshotDeltas(entrySnapshot.blocks).find(
      delta => delta.attributes?.reference?.type === 'LinkedPage'
    );
    const linkedPageId =
      linkedPageDelta?.attributes?.reference?.type === 'LinkedPage'
        ? linkedPageDelta.attributes.reference.pageId
        : undefined;
    expect(linkedPageId).toBeTruthy();
    expect(
      JSON.stringify(
        snapshotDocByTitle(
          collection,
          'duplicate',
          new Map([[linkedPageId!, 'duplicate']])
        )
      )
    ).toContain('folder duplicate');
    expect(collectSimplifiedDeltas(entry)).toContainEqual({
      insert: ' ',
      reference: {
        type: 'LinkedPage',
        page: 'duplicate',
        title: '同名',
      },
    });
    expect(JSON.stringify(entry).match(/"sourceId":"<asset>"/g)).toHaveLength(
      2
    );
    expect(folderHierarchy?.children.has('folder')).toBe(true);
    expect(folderHierarchy?.children.has('other')).toBe(true);
    expect(
      collection.meta.docMetas.some(meta => meta.title === 'ignored')
    ).toBe(false);
  });

  test('imports notion markdown zip relative doc links as linked pages', async () => {
    const schema = new Schema().register(AffineSchemas);
    const collection = new TestWorkspace();
    collection.storeExtensions = testStoreExtensions;
    collection.meta.initialize();

    const imported = zipFixture({
      'Workspace 11111111111111111111111111111111/Entry 22222222222222222222222222222222.md':
        '# Entry\n[引用](./test/Target%2033333333333333333333333333333333.md)',
      'Workspace 11111111111111111111111111111111/test/Target 33333333333333333333333333333333.md':
        '# Target\ntarget page',
    });

    const { docIds } = await commitPlannedImport(
      collection,
      schema,
      await MarkdownTransformer.planNotionMarkdownZip({
        collection,
        schema,
        imported,
        extensions: testStoreExtensions,
      })
    );
    expect(docIds).toHaveLength(2);

    const titleById = new Map(
      collection.meta.docMetas.map(meta => [
        meta.id,
        meta.title ?? '<untitled>',
      ])
    );
    const entryDeltas = collectSimplifiedDeltas(
      snapshotDocByTitle(collection, 'Entry', titleById)
    );

    expect(entryDeltas).toContainEqual({
      insert: ' ',
      reference: {
        type: 'LinkedPage',
        page: 'Target',
        title: '引用',
      },
    });
  });

  test('imports nested notion markdown zips with isolated relative links', async () => {
    const schema = new Schema().register(AffineSchemas);
    const collection = new TestWorkspace();
    collection.storeExtensions = testStoreExtensions;
    collection.meta.initialize();

    const imported = zipFixture({
      'Export/Part A.zip': zipBytes({
        'Entry 11111111111111111111111111111111.md':
          '# Entry A\n[go](./Target%2022222222222222222222222222222222.md)',
        'Target 22222222222222222222222222222222.md': '# Target A\nA body',
      }),
      'Export/Part B.zip': zipBytes({
        'Entry 11111111111111111111111111111111.md':
          '# Entry B\n[go](./Target%2022222222222222222222222222222222.md)',
        'Target 22222222222222222222222222222222.md': '# Target B\nB body',
      }),
    });

    const { docIds, folderHierarchy } = await commitPlannedImport(
      collection,
      schema,
      await MarkdownTransformer.planNotionMarkdownZip({
        collection,
        schema,
        imported,
        extensions: testStoreExtensions,
      })
    );
    expect(docIds).toHaveLength(4);

    const titleById = new Map(
      collection.meta.docMetas.map(meta => [
        meta.id,
        meta.title ?? '<untitled>',
      ])
    );
    const entryADeltas = collectSimplifiedDeltas(
      snapshotDocByTitle(collection, 'Entry A', titleById)
    );
    const entryBDeltas = collectSimplifiedDeltas(
      snapshotDocByTitle(collection, 'Entry B', titleById)
    );

    expect(entryADeltas).toContainEqual({
      insert: ' ',
      reference: {
        type: 'LinkedPage',
        page: 'Target A',
        title: 'go',
      },
    });
    expect(entryBDeltas).toContainEqual({
      insert: ' ',
      reference: {
        type: 'LinkedPage',
        page: 'Target B',
        title: 'go',
      },
    });

    const [rootFolder] = [...(folderHierarchy?.children.values() ?? [])];
    expect(rootFolder?.name).toBe('Export');
    expect(
      [...(rootFolder?.children.values() ?? [])].map(node => node.name)
    ).toEqual(expect.arrayContaining(['Part A', 'Part B']));
  });

  test('imports obsidian vault fixtures', async () => {
    const schema = new Schema().register(AffineSchemas);
    const collection = new TestWorkspace();
    collection.storeExtensions = testStoreExtensions;
    collection.meta.initialize();

    const attachment = withRelativePath(
      new File([new Uint8Array([80, 75, 3, 4])], 'archive.zip', {
        type: 'application/zip',
      }),
      'vault/archive.zip'
    );

    const { docIds } = await commitPlannedImport(
      collection,
      schema,
      await ObsidianTransformer.planObsidianVault({
        collection,
        schema,
        importedFiles: [
          markdownFixture('entry.md'),
          markdownFixture('linked.md'),
          attachment,
        ],
        extensions: testStoreExtensions,
      })
    );
    expect(docIds).toHaveLength(2);

    const titleById = new Map(
      collection.meta.docMetas.map(meta => [
        meta.id,
        meta.title ?? '<untitled>',
      ])
    );

    expect({
      titles: collection.meta.docMetas
        .map(meta => meta.title)
        .sort((a, b) => (a ?? '').localeCompare(b ?? '')),
      entry: snapshotDocByTitle(collection, 'entry', titleById),
    }).toMatchSnapshot();
  });

  test('imports notion html zip golden baseline', async () => {
    const schema = new Schema().register(AffineSchemas);
    const collection = new TestWorkspace();
    collection.storeExtensions = testStoreExtensions;
    collection.meta.initialize();

    const imported = zipFixture({
      'Export/index.html': '<html><body>workspace index</body></html>',
      'Export/Project.html': `
        <html>
          <body>
            <div class="page-header-icon undefined"><span class="icon">✅</span></div>
            <div class="page-body">
              <p id="11111111-1111-1111-1111-111111111111" class="">Project body</p>
              <img id="22222222-2222-2222-2222-222222222222" src="assets/logo.png" />
            </div>
          </body>
        </html>
      `,
      'Export/Project/Nested.html': `
        <html>
          <body>
            <div class="page-body"><p id="33333333-3333-3333-3333-333333333333" class="">Nested body</p></div>
          </body>
        </html>
      `,
      'Export/assets/logo.png': new Uint8Array([137, 80, 78, 71]),
    });

    const result = await commitPlannedImport(
      collection,
      schema,
      await NotionHtmlTransformer.planNotionHtmlZip({
        collection,
        schema,
        imported,
        extensions: testStoreExtensions,
      })
    );

    expect(result.isWorkspaceFile).toBe(true);
    expect(result.hasMarkdown).toBe(false);
    expect(result.pageIds).toHaveLength(2);
    expect(collection.meta.docMetas.map(meta => meta.title)).toEqual(['', '']);

    const titles = titleMap(collection);
    const importedSnapshots = result.pageIds.map(pageId =>
      simplifyBlockForSnapshot(
        exportSnapshot(collection.getDoc(pageId)!.getStore({ id: pageId }))
          .blocks,
        titles
      )
    );
    const projectSnapshot = importedSnapshots.find(snapshot =>
      JSON.stringify(snapshot).includes('Project body')
    );
    expect(projectSnapshot).toBeTruthy();
    expect(JSON.stringify(projectSnapshot)).toContain('Project body');
    expect(JSON.stringify(projectSnapshot)).toContain('"sourceId":"<asset>"');

    const exportFolder = folderChild(result.folderHierarchy, 'Export');
    const projectNode = folderChild(exportFolder, 'Project');
    expect(result.pageIds).toContain(projectNode?.pageId);
    expect(projectNode?.icon).toEqual({ type: 'emoji', content: '✅' });
    expect(result.pageIds).toContain(
      folderChild(projectNode, 'Nested')?.pageId
    );
  });

  test('imports bear backup golden baseline', async () => {
    const schema = new Schema().register(AffineSchemas);
    const collection = new TestWorkspace();
    collection.storeExtensions = testStoreExtensions;
    collection.meta.initialize();

    const imported = zipFixture({
      'Notes/Idea.textbundle/text.md': [
        '# Bear Title',
        '',
        '![photo](assets/photo.png)',
        '',
        '==🟢green highlight==',
        '',
        '#work/project',
        '#Blue Tag#',
      ].join('\n'),
      'Notes/Idea.textbundle/info.json': JSON.stringify({
        'net.shinyfrog.bear': {
          creationDate: '2024-01-02T03:04:05.000Z',
          modificationDate: '2024-01-03T03:04:05.000Z',
        },
      }),
      'Notes/Idea.textbundle/assets/photo.png': new Uint8Array([
        137, 80, 78, 71,
      ]),
    });

    const { docIds, tags, folderHierarchy } = await commitPlannedImport(
      collection,
      schema,
      await BearTransformer.planBearBackup({
        collection,
        schema,
        imported,
        extensions: testStoreExtensions,
      })
    );

    expect(docIds).toHaveLength(1);
    const meta = collection.meta.getDocMeta(docIds[0]);
    expect(meta?.title).toBe('Bear Title');
    expect(meta?.createDate).toBe(Date.parse('2024-01-02T03:04:05.000Z'));
    expect(meta?.updatedDate).toBe(Date.parse('2024-01-03T03:04:05.000Z'));
    expect([...tags.keys()]).toEqual(['Blue Tag', 'work/project']);

    const titles = titleMap(collection);
    const snapshot = snapshotDocByTitle(collection, 'Bear Title', titles);
    expect(JSON.stringify(snapshot)).toContain('"sourceId":"<asset>"');
    expect(JSON.stringify(snapshot)).toContain('green highlight');

    const blueTag = folderChild(folderHierarchy, 'Blue Tag');
    expect([
      ...(
        (blueTag?.children as Map<string, unknown> | undefined) ?? new Map()
      ).values(),
    ]).toEqual(
      expect.arrayContaining([expect.objectContaining({ pageId: docIds[0] })])
    );
    const project = folderChild(
      folderChild(folderHierarchy, 'work'),
      'project'
    );
    expect([
      ...(
        (project?.children as Map<string, unknown> | undefined) ?? new Map()
      ).values(),
    ]).toEqual(
      expect.arrayContaining([expect.objectContaining({ pageId: docIds[0] })])
    );
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
    const markdown = `aaa

&#x20;   bbb

&#x20;   ccc

&#x20;       ddd

&#x20;       eee

&#x20;       fff

&#x20;   ggg

hhh
`;

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const target = await mdAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(markdown);
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
    const markdown = `* aaa
  * bbb
    * ccc
  * ddd
* eee
`;

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const target = await mdAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(markdown);
  });

  test('todo list', async () => {
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
                type: 'todo',
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
                    type: 'todo',
                    text: {
                      '$blocksuite:internal:text$': true,
                      delta: [
                        {
                          insert: 'bbb',
                        },
                      ],
                    },
                    checked: true,
                    collapsed: false,
                  },
                  children: [
                    {
                      type: 'block',
                      id: 'block:UyvxA_gqCJ',
                      flavour: 'affine:list',
                      props: {
                        type: 'todo',
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
                    type: 'todo',
                    text: {
                      '$blocksuite:internal:text$': true,
                      delta: [
                        {
                          insert: 'ddd',
                        },
                      ],
                    },
                    checked: true,
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
                type: 'todo',
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
    const markdown = `\
* [ ] aaa
  * [x] bbb
    * [ ] ccc
  * [x] ddd
* [ ] eee
`;

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const target = await mdAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(markdown);
  });

  test('numbered list', async () => {
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'block:m5hvdXHXS2',
      flavour: 'affine:page',
      version: 2,
      props: {
        title: {
          '$blocksuite:internal:text$': true,
          delta: [],
        },
      },
      children: [
        {
          type: 'block',
          id: 'block:Y4J-oO9h9d',
          flavour: 'affine:surface',
          version: 5,
          props: {
            elements: {},
          },
          children: [],
        },
        {
          type: 'block',
          id: 'block:1Ll22zT992',
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
              id: 'block:Fd0ZCYB7a4',
              flavour: 'affine:list',
              version: 1,
              props: {
                type: 'numbered',
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
                  id: 'block:8-GeKDc06x',
                  flavour: 'affine:list',
                  version: 1,
                  props: {
                    type: 'numbered',
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
                  id: 'block:f0c-9xKaEL',
                  flavour: 'affine:list',
                  version: 1,
                  props: {
                    type: 'numbered',
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
              id: 'block:Fd0ZCYB7a5',
              flavour: 'affine:list',
              version: 1,
              props: {
                type: 'numbered',
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
      ],
    };

    const markdown = `1. aaa
   1. bbb
   2. ccc
2. ddd
`;

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const target = await mdAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toEqual(markdown);
  });

  test('different list', async () => {
    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'block:m5hvdXHXS2',
      flavour: 'affine:page',
      version: 2,
      props: {
        title: {
          '$blocksuite:internal:text$': true,
          delta: [],
        },
      },
      children: [
        {
          type: 'block',
          id: 'block:Y4J-oO9h9d',
          flavour: 'affine:surface',
          version: 5,
          props: {
            elements: {},
          },
          children: [],
        },
        {
          type: 'block',
          id: 'block:1Ll22zT992',
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
              id: 'block:Fd0ZCYB7a4',
              flavour: 'affine:list',
              version: 1,
              props: {
                type: 'numbered',
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
                  id: 'block:8-GeKDc06x',
                  flavour: 'affine:list',
                  version: 1,
                  props: {
                    type: 'numbered',
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
                  id: 'block:f0c-9xKaEL',
                  flavour: 'affine:list',
                  version: 1,
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
                {
                  type: 'block',
                  id: 'block:f0c-9xKaEL',
                  flavour: 'affine:list',
                  version: 1,
                  props: {
                    type: 'numbered',
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
              id: 'block:Fd0ZCYB7a5',
              flavour: 'affine:list',
              version: 1,
              props: {
                type: 'numbered',
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

    const markdown = `1. aaa
   1. bbb
   * ccc
   1. ddd
2. eee
`;

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const target = await mdAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toEqual(markdown);
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
    const markdown = 'aaa `bbb` ccc\n';

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const target = await mdAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(markdown);
  });

  test('inline latex', async () => {
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
                      insert: 'inline ',
                    },
                    {
                      insert: ' ',
                      attributes: {
                        latex: 'E=mc^2',
                      },
                    },
                    {
                      insert: ' latex',
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
    const markdown = 'inline $E=mc^2$ latex\n';

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const target = await mdAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(markdown);
  });

  test('latex block', async () => {
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
              flavour: 'affine:latex',
              props: {
                latex: 'E=mc^2',
              },
              children: [],
            },
          ],
        },
      ],
    };

    const markdown = '$$\nE=mc^2\n$$\n';

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const target = await mdAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(markdown);
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
    const markdown = 'aaa [bbb](https://affine.pro/) ccc\n';

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const target = await mdAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(markdown);
  });

  test('inline link', async () => {
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
                      insert: 'https://affine.pro/  ',
                      attributes: {
                        link: 'https://affine.pro/  ',
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
    };
    const markdown = 'aaa https://affine.pro/  \n';

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const target = await mdAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(markdown);
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

    const markdown = 'aaa**bbb**ccc\n';

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const target = await mdAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(markdown);
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

    const markdown = 'aaa*bbb*ccc\n';

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const target = await mdAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(markdown);
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

    const markdown =
      '![](assets/YXXTjRmLlNyiOUnHb8nAIvUP6V7PAXhwW9F5_tc2LGs=.blob "aaa")\n\n';

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const blobCRUD = new MemoryBlobCRUD();
    await blobCRUD.set(
      'YXXTjRmLlNyiOUnHb8nAIvUP6V7PAXhwW9F5_tc2LGs=',
      new Blob()
    );
    const assets = new AssetsManager({ blob: blobCRUD });

    const target = await mdAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
      assets,
    });
    expect(target.file).toBe(markdown);
  });

  test('table', async () => {
    const blockSnapshot: BlockSnapshot = {
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
    };

    const md = `\
| Title  | Status      | Date       | Number | Progress | MultiSelect | RichText                    | Link               | Checkbox |
| ------ | ----------- | ---------- | ------ | -------- | ----------- | --------------------------- | ------------------ | -------- |
| Task 1 | TODO        | 2023-12-15 | 1      | 65       | test1,test2 | [test2](https://google.com) | https://google.com | True     |
| Task 2 | In Progress | 2023-12-20 |        |          |             | test1                       |                    |          |
`;
    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const target = await mdAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(md);
  });

  test('reference', async () => {
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
                            {
                              insert: '',
                              attributes: {
                                reference: {
                                  type: 'LinkedPage',
                                  pageId: 'deadbeef',
                                  params: {
                                    mode: 'page',
                                    blockIds: ['abc', '123'],
                                    elementIds: ['def', '456'],
                                    databaseId: 'deadbeef',
                                    databaseRowId: '123',
                                  },
                                },
                              },
                            },
                            {
                              insert: ' ',
                              attributes: {
                                reference: {
                                  type: 'LinkedPage',
                                  pageId: 'foobar',
                                },
                              },
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
    const markdown = `aaa

&#x20;   bbb

[untitled](https://example.com/4T5ObMgEIMII-4Bexyta1?mode=page\\&blockIds=abc%2C123\\&elementIds=def%2C456\\&databaseId=deadbeef\\&databaseRowId=123)

&#x20;   ccc

&#x20;       ddd

&#x20;       eee[test](https://example.com/deadbeef?mode=page\\&blockIds=abc%2C123\\&elementIds=def%2C456\\&databaseId=deadbeef\\&databaseRowId=123)[](https://example.com/foobar)

&#x20;       fff

&#x20;   ggg

hhh
`;
    const middleware: TransformerMiddleware = ({ adapterConfigs }) => {
      adapterConfigs.set('title:deadbeef', 'test');
      adapterConfigs.set('docLinkBaseUrl', 'https://example.com');
    };
    const mdAdapter = new MarkdownAdapter(createJob([middleware]), provider);
    const target = await mdAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(markdown);
  });

  test('synced-doc', async () => {
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
                id: 'DF26giFpKX',
                flavour: 'affine:code',
                version: 1,
                props: {
                  text: {
                    '$blocksuite:internal:text$': true,
                    delta: [
                      {
                        insert: 'Hello world!',
                      },
                    ],
                  },
                  language: 'cpp',
                  wrap: false,
                  caption: '',
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

    const syncedDocMd =
      '# Synced Doc\n\n# Heading 1\n\n## heading 2\n\nparagraph\n\n~~strike~~\n\n```cpp\nHello world!\n```';

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

    const docMd = `\
# Test Doc

Hello

${syncedDocMd}

Deepest Doc

World!
`;

    const job = createJob([embedSyncedDocMiddleware('content')]);

    // workaround for adding docs to collection
    await job.snapshotToDoc(deepestSyncedDocSnapshot);
    await job.snapshotToDoc(syncedDocSnapshot);
    await job.snapshotToDoc(docSnapShot);

    const mdAdapter = new MarkdownAdapter(job, provider);
    const target = await mdAdapter.fromDocSnapshot({
      snapshot: docSnapShot,
    });
    expect(target.file).toBe(docMd);
  });

  test('footnote', async () => {
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
                      insert: ' ',
                      attributes: {
                        footnote: {
                          label: '1',
                          reference: {
                            type: 'url',
                            url: 'https://www.example.com',
                            favicon: 'https://www.example.com/favicon.ico',
                            title: 'Example Domain',
                            description: 'Example Domain',
                          },
                        },
                      },
                    },
                    {
                      insert: ' ',
                      attributes: {
                        footnote: {
                          label: '2',
                          reference: {
                            type: 'doc',
                            docId: 'deadbeef',
                          },
                        },
                      },
                    },
                    {
                      insert: ' ',
                      attributes: {
                        footnote: {
                          label: '3',
                          reference: {
                            type: 'attachment',
                            blobId: 'abcdefg',
                            fileName: 'test.txt',
                            fileType: 'text/plain',
                          },
                        },
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
    };

    const markdown =
      'aaa[^1][^2][^3]\n\n[^1]: {"type":"url","url":"https%3A%2F%2Fwww.example.com","favicon":"https%3A%2F%2Fwww.example.com%2Ffavicon.ico","title":"Example Domain","description":"Example Domain"}\n\n[^2]: {"type":"doc","docId":"deadbeef"}\n\n[^3]: {"type":"attachment","blobId":"abcdefg","fileName":"test.txt","fileType":"text/plain"}\n';

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const target = await mdAdapter.fromBlockSnapshot({
      snapshot: blockSnapshot,
    });
    expect(target.file).toBe(markdown);
  });

  describe('callout', () => {
    test('without export middleware', async () => {
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
                flavour: 'affine:callout',
                props: {
                  emoji: '💡',
                },
                children: [
                  {
                    type: 'block',
                    id: 'block:8hOLxad5Fv',
                    flavour: 'affine:paragraph',
                    props: {
                      type: 'text',
                      text: {
                        '$blocksuite:internal:text$': true,
                        delta: [{ insert: 'First callout' }],
                      },
                    },
                    children: [],
                  },
                ],
              },
              {
                type: 'block',
                id: 'block:8hOLxadvdv',
                flavour: 'affine:callout',
                props: {
                  emoji: '',
                },
                children: [
                  {
                    type: 'block',
                    id: 'block:8hOLxad5Fv',
                    flavour: 'affine:paragraph',
                    props: {
                      type: 'text',
                      text: {
                        '$blocksuite:internal:text$': true,
                        delta: [
                          { insert: 'Warning second callout without emoji' },
                        ],
                      },
                    },
                    children: [],
                  },
                  {
                    type: 'block',
                    id: 'block:8hOLxad5Fv',
                    flavour: 'affine:paragraph',
                    props: {
                      type: 'text',
                      text: {
                        '$blocksuite:internal:text$': true,
                        delta: [{ insert: 'Text in second callout' }],
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

      const markdown = `> \\[!💡]
>
> First callout

> \\[!]
>
> Warning second callout without emoji
>
> Text in second callout
`;

      const mdAdapter = new MarkdownAdapter(createJob(), provider);
      const target = await mdAdapter.fromBlockSnapshot({
        snapshot: blockSnapshot,
      });
      expect(target.file).toBe(markdown);
    });

    test('with export middleware', async () => {
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
                flavour: 'affine:callout',
                props: {
                  emoji: '💡',
                },
                children: [
                  {
                    type: 'block',
                    id: 'block:8hOLxad5Fv',
                    flavour: 'affine:paragraph',
                    props: {
                      type: 'text',
                      text: {
                        '$blocksuite:internal:text$': true,
                        delta: [
                          { insert: 'Callout that does not have a title' },
                        ],
                      },
                    },
                    children: [],
                  },
                ],
              },
              {
                type: 'block',
                id: 'block:8hOLxadvdv',
                flavour: 'affine:callout',
                props: {
                  emoji: '',
                },
                children: [
                  {
                    type: 'block',
                    id: 'block:8hOLxad5Fv',
                    flavour: 'affine:paragraph',
                    props: {
                      type: 'text',
                      text: {
                        '$blocksuite:internal:text$': true,
                        delta: [
                          {
                            insert:
                              'Warning callout with custom title and multiple paragraphs',
                          },
                        ],
                      },
                    },
                    children: [],
                  },
                  {
                    type: 'block',
                    id: 'block:8hOLxad5Fv',
                    flavour: 'affine:paragraph',
                    props: {
                      type: 'text',
                      text: {
                        '$blocksuite:internal:text$': true,
                        delta: [{ insert: 'Text in second callout' }],
                      },
                    },
                    children: [],
                  },
                ],
              },
              {
                type: 'block',
                id: 'block:8hOLxad5Fv',
                flavour: 'affine:callout',
                props: {
                  emoji: '💡',
                },
                children: [
                  {
                    type: 'block',
                    id: 'block:8hOLxad5Fv',
                    flavour: 'affine:paragraph',
                    props: {
                      type: 'text',
                      text: {
                        '$blocksuite:internal:text$': true,
                        delta: [
                          { insert: 'details' },
                          { insert: ' ' },
                          { insert: '\nText in details callout with new line' },
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

      const markdown = `::: info

Callout that does not have a title

:::

::: warning callout with custom title and multiple paragraphs

Text in second callout

:::

::: details

Text in details callout with new line

:::
`;

      const mdAdapter = new MarkdownAdapter(
        createJob([
          calloutMarkdownExportMiddleware({
            style: CalloutExportStyle.Admonitions,
            admonitionType: CalloutAdmonitionType.Info,
          }),
        ]),
        provider
      );
      const target = await mdAdapter.fromBlockSnapshot({
        snapshot: blockSnapshot,
      });
      expect(target.file).toBe(markdown);
    });
  });
});

describe('markdown to snapshot', () => {
  describe('code', () => {
    test('markdown code block', async () => {
      const markdown = '```python\nimport this\n```\n';

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

      const mdAdapter = new MarkdownAdapter(createJob(), provider);
      const rawBlockSnapshot = await mdAdapter.toBlockSnapshot({
        file: markdown,
      });
      expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
    });

    test('code with indentation 1 - slice', async () => {
      const markdown = '```python\n    import this\n```';

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
                flavour: 'affine:code',
                props: {
                  language: 'python',
                  wrap: false,
                  text: {
                    '$blocksuite:internal:text$': true,
                    delta: [
                      {
                        insert: '    import this',
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

      const mdAdapter = new MarkdownAdapter(createJob(), provider);
      const rawSliceSnapshot = await mdAdapter.toSliceSnapshot({
        file: markdown,
        workspaceId: '',
        pageId: '',
      });
      expect(nanoidReplacement(rawSliceSnapshot!)).toEqual(sliceSnapshot);
    });

    test('code with indentation 2 - slice', async () => {
      const markdown = '````python\n```python\n    import this\n```\n````';

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
                flavour: 'affine:code',
                props: {
                  language: 'python',
                  wrap: false,
                  text: {
                    '$blocksuite:internal:text$': true,
                    delta: [
                      {
                        insert: '```python\n    import this\n```',
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

      const mdAdapter = new MarkdownAdapter(createJob(), provider);
      const rawSliceSnapshot = await mdAdapter.toSliceSnapshot({
        file: markdown,
        workspaceId: '',
        pageId: '',
      });
      expect(nanoidReplacement(rawSliceSnapshot!)).toEqual(sliceSnapshot);
    });

    test('code with indentation 3 - slice', async () => {
      const markdown = '~~~~python\n````python\n    import this\n````\n~~~~';

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
                flavour: 'affine:code',
                props: {
                  language: 'python',
                  wrap: false,
                  text: {
                    '$blocksuite:internal:text$': true,
                    delta: [
                      {
                        insert: '````python\n    import this\n````',
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

      const mdAdapter = new MarkdownAdapter(createJob(), provider);
      const rawSliceSnapshot = await mdAdapter.toSliceSnapshot({
        file: markdown,
        workspaceId: '',
        pageId: '',
      });
      expect(nanoidReplacement(rawSliceSnapshot!)).toEqual(sliceSnapshot);
    });

    test('html block import as code block', async () => {
      const markdown = `<div class="container">
  <header>
    <h1>Welcome to My Page</h1>
    <nav>
      <ul>
        <li><a href="#home">Home</a></li>
        <li><a href="#about">About</a></li>
      </ul>
    </nav>
  </header>
  <main>
    <p>This is a sample HTML content</p>
  </main>
</div>`;

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
              language: 'html',
              wrap: false,
              text: {
                '$blocksuite:internal:text$': true,
                delta: [
                  {
                    insert:
                      '<div class="container">\n  <header>\n    <h1>Welcome to My Page</h1>\n    <nav>\n      <ul>\n        <li><a href="#home">Home</a></li>\n        <li><a href="#about">About</a></li>\n      </ul>\n    </nav>\n  </header>\n  <main>\n    <p>This is a sample HTML content</p>\n  </main>\n</div>',
                  },
                ],
              },
            },
            children: [],
          },
        ],
      };

      const mdAdapter = new MarkdownAdapter(createJob(), provider);
      const rawBlockSnapshot = await mdAdapter.toBlockSnapshot({
        file: markdown,
      });
      expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
    });
  });

  test('html inline color span imports to nearest supported text color', async () => {
    const markdown = `<span style="color: #00afde;">Hello</span>`;
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
                  insert: 'Hello',
                  attributes: {
                    color: 'var(--affine-v2-text-highlight-fg-blue)',
                  },
                },
              ],
            },
          },
          children: [],
        },
      ],
    };

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const rawBlockSnapshot = await mdAdapter.toBlockSnapshot({
      file: markdown,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('paragraph', async () => {
    const markdown = `aaa

&#x20;   bbb

&#x20;   ccc

&#x20;       ddd

&#x20;       eee

&#x20;       fff

&#x20;   ggg

hhh
`;

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
                  insert: '    bbb',
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
                  insert: '    ccc',
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
                  insert: '        ddd',
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
                  insert: '        eee',
                },
              ],
            },
          },
          children: [],
        },
        {
          type: 'block',
          id: 'matchesReplaceMap[6]',
          flavour: 'affine:paragraph',
          props: {
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: '        fff',
                },
              ],
            },
            type: 'text',
          },
          children: [],
        },
        {
          type: 'block',
          id: 'matchesReplaceMap[7]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: '    ggg',
                },
              ],
            },
          },
          children: [],
        },
        {
          type: 'block',
          id: 'matchesReplaceMap[8]',
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
    };

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const rawBlockSnapshot = await mdAdapter.toBlockSnapshot({
      file: markdown,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('bulleted list', async () => {
    const markdown = `* aaa

  * bbb

    * ccc

  - ddd

- eee
`;

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
                  insert: 'aaa',
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
                      insert: 'bbb',
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
                  id: 'matchesReplaceMap[3]',
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
                    order: null,
                  },
                  children: [],
                },
              ],
            },
            {
              type: 'block',
              id: 'matchesReplaceMap[4]',
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
                order: null,
              },
              children: [],
            },
          ],
        },
        {
          type: 'block',
          id: 'matchesReplaceMap[5]',
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
            order: null,
          },
          children: [],
        },
      ],
    };

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const rawBlockSnapshot = await mdAdapter.toBlockSnapshot({
      file: markdown,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('todo list', async () => {
    const markdown = `- [ ] aaa

  - [x] bbb

    - [ ] ccc

  - [x] ddd

- [ ] eee
`;

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
            type: 'todo',
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
            order: null,
          },
          children: [
            {
              type: 'block',
              id: 'matchesReplaceMap[2]',
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
                checked: true,
                collapsed: false,
                order: null,
              },
              children: [
                {
                  type: 'block',
                  id: 'matchesReplaceMap[3]',
                  flavour: 'affine:list',
                  props: {
                    type: 'todo',
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
                    order: null,
                  },
                  children: [],
                },
              ],
            },
            {
              type: 'block',
              id: 'matchesReplaceMap[4]',
              flavour: 'affine:list',
              props: {
                type: 'todo',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'ddd',
                    },
                  ],
                },
                checked: true,
                collapsed: false,
                order: null,
              },
              children: [],
            },
          ],
        },
        {
          type: 'block',
          id: 'matchesReplaceMap[5]',
          flavour: 'affine:list',
          props: {
            type: 'todo',
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
            order: null,
          },
          children: [],
        },
      ],
    };

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const rawBlockSnapshot = await mdAdapter.toBlockSnapshot({
      file: markdown,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('non consecutive numbered list', async () => {
    const markdown = `
1. aaa

bbb

3. ccc
4. ddd
`;

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
                  insert: 'aaa',
                },
              ],
            },
            checked: false,
            collapsed: false,
            order: 1,
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
          flavour: 'affine:list',
          props: {
            type: 'numbered',
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
            order: 3,
          },
          children: [],
        },
        {
          type: 'block',
          id: 'matchesReplaceMap[4]',
          flavour: 'affine:list',
          props: {
            type: 'numbered',
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
            order: 4,
          },
          children: [],
        },
      ],
    };

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const rawBlockSnapshot = await mdAdapter.toBlockSnapshot({
      file: markdown,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('code inline', async () => {
    const markdown = 'aaa `bbb` ccc\n';
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
    };

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const rawBlockSnapshot = await mdAdapter.toBlockSnapshot({
      file: markdown,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('code inline - slice', async () => {
    const markdown = '``` ```\n    aaa';

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
                      insert: ' ',
                      attributes: {
                        code: true,
                      },
                    },
                    {
                      insert: '\n    aaa',
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

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const rawSliceSnapshot = await mdAdapter.toSliceSnapshot({
      file: markdown,
      workspaceId: '',
      pageId: '',
    });
    expect(nanoidReplacement(rawSliceSnapshot!)).toEqual(sliceSnapshot);
  });

  test('link', async () => {
    const markdown = 'aaa [bbb](https://affine.pro/) ccc\n';
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
    };

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const rawBlockSnapshot = await mdAdapter.toBlockSnapshot({
      file: markdown,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('inline link', async () => {
    const markdown = 'aaa https://affine.pro/ ccc\n';
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
                  insert: 'aaa ',
                },
                {
                  insert: 'https://affine.pro/',
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
    };

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const rawBlockSnapshot = await mdAdapter.toBlockSnapshot({
      file: markdown,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('bold', async () => {
    const markdown = 'aaa**bbb**ccc\n';

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
    };

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const rawBlockSnapshot = await mdAdapter.toBlockSnapshot({
      file: markdown,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('italic', async () => {
    const markdown = 'aaa*bbb*ccc\n';

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
    };

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const rawBlockSnapshot = await mdAdapter.toBlockSnapshot({
      file: markdown,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  test('table', async () => {
    const markdown = `| aaa | bbb | ccc |
| --- | --- | --- |
| ddd | eee | fff |
`;

    const blockSnapshot: BlockSnapshot = {
      type: 'block',
      id: 'matchesReplaceMap[0]',
      flavour: 'affine:note',
      props: {
        xywh: '[0,0,800,95]',
        background: {
          dark: '#252525',
          light: '#ffffff',
        },
        index: 'a0',
        hidden: false,
        displayMode: 'both',
      },
      children: [
        {
          type: 'block',
          id: 'matchesReplaceMap[1]',
          flavour: TableModelFlavour,
          props: {
            columns: {
              'matchesReplaceMap[3]': {
                columnId: 'matchesReplaceMap[3]',
                order: 'matchesReplaceMap[4]',
              },
              'matchesReplaceMap[6]': {
                columnId: 'matchesReplaceMap[6]',
                order: 'matchesReplaceMap[7]',
              },
              'matchesReplaceMap[9]': {
                columnId: 'matchesReplaceMap[9]',
                order: 'matchesReplaceMap[10]',
              },
            },
            rows: {
              'matchesReplaceMap[12]': {
                rowId: 'matchesReplaceMap[12]',
                order: 'matchesReplaceMap[13]',
              },
              'matchesReplaceMap[15]': {
                rowId: 'matchesReplaceMap[15]',
                order: 'matchesReplaceMap[16]',
              },
            },
            cells: {
              'matchesReplaceMap[17]': {
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'aaa',
                    },
                  ],
                },
              },
              'matchesReplaceMap[18]': {
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'bbb',
                    },
                  ],
                },
              },
              'matchesReplaceMap[19]': {
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'ccc',
                    },
                  ],
                },
              },
              'matchesReplaceMap[20]': {
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'ddd',
                    },
                  ],
                },
              },
              'matchesReplaceMap[21]': {
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'eee',
                    },
                  ],
                },
              },
              'matchesReplaceMap[22]': {
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [
                    {
                      insert: 'fff',
                    },
                  ],
                },
              },
            },
          },
          children: [],
        },
      ],
    };

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const rawBlockSnapshot = await mdAdapter.toBlockSnapshot({
      file: markdown,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  describe('inline latex', () => {
    test.each([
      ['dollar sign syntax', 'inline $E=mc^2$ latex\n'],
      ['backslash syntax', 'inline \\(E=mc^2\\) latex\n'],
    ])('should convert %s correctly', async (_, markdown) => {
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
                    insert: 'inline ',
                  },
                  {
                    insert: ' ',
                    attributes: {
                      latex: 'E=mc^2',
                    },
                  },
                  {
                    insert: ' latex',
                  },
                ],
              },
            },
            children: [],
          },
        ],
      };

      const mdAdapter = new MarkdownAdapter(createJob(), provider);
      const rawBlockSnapshot = await mdAdapter.toBlockSnapshot({
        file: markdown,
      });
      expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
    });
  });

  describe('latex block', () => {
    test.each([
      ['dollar sign syntax', '$$\nE=mc^2\n$$\n'],
      ['backslash syntax', '\\[\nE=mc^2\n\\]\n'],
    ])('should convert %s correctly', async (_, markdown) => {
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
            flavour: 'affine:latex',
            props: {
              latex: 'E=mc^2',
            },
            children: [],
          },
        ],
      };

      const mdAdapter = new MarkdownAdapter(createJob(), provider);
      const rawBlockSnapshot = await mdAdapter.toBlockSnapshot({
        file: markdown,
      });
      expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
    });

    test('escapes dollar signs followed by a digit or space and digit', async () => {
      const markdown =
        'The price of the T-shirt is $9.15 and the price of the hat is $ 8\n';
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
                    insert:
                      'The price of the T-shirt is $9.15 and the price of the hat is $ 8',
                  },
                ],
              },
            },
            children: [],
          },
        ],
      };
      const mdAdapter = new MarkdownAdapter(createJob(), provider);
      const rawBlockSnapshot = await mdAdapter.toBlockSnapshot({
        file: markdown,
      });
      expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
    });
  });

  test('reference', async () => {
    const markdown = `
aaa

&#x20;   bbb

[untitled](https://example.com/4T5ObMgEIMII-4Bexyta1)

&#x20;   ccc

&#x20;       ddd

&#x20;       eee[test](https://example.com/deadbeef?mode=page\\&blockIds=abc%2C123\\&elementIds=def%2C456)[](https://example.com/foobar)

&#x20;       fff

&#x20;   ggg

hhh
`;
    const blockSnapshot: BlockSnapshot = {
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
              delta: [{ insert: 'aaa' }],
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
              delta: [{ insert: '    bbb' }],
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
                  insert: ' ',
                  attributes: {
                    reference: {
                      type: 'LinkedPage',
                      pageId: '4T5ObMgEIMII-4Bexyta1',
                      params: {},
                    },
                  },
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
              delta: [{ insert: '    ccc' }],
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
              delta: [{ insert: '        ddd' }],
            },
          },
          children: [],
        },
        {
          type: 'block',
          id: 'matchesReplaceMap[6]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                { insert: '        eee' },
                {
                  insert: ' ',
                  attributes: {
                    reference: {
                      type: 'LinkedPage',
                      pageId: 'deadbeef',
                      params: {
                        mode: 'page',
                        blockIds: ['abc', '123'],
                        elementIds: ['def', '456'],
                      },
                    },
                  },
                },
                {
                  insert: ' ',
                  attributes: {
                    reference: {
                      type: 'LinkedPage',
                      pageId: 'foobar',
                      params: {},
                    },
                  },
                },
              ],
            },
          },
          children: [],
        },
        {
          type: 'block',
          id: 'matchesReplaceMap[7]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [{ insert: '        fff' }],
            },
          },
          children: [],
        },
        {
          type: 'block',
          id: 'matchesReplaceMap[8]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [{ insert: '    ggg' }],
            },
          },
          children: [],
        },
        {
          type: 'block',
          id: 'matchesReplaceMap[9]',
          flavour: 'affine:paragraph',
          props: {
            type: 'text',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [{ insert: 'hhh' }],
            },
          },
          children: [],
        },
      ],
    };
    const middleware: TransformerMiddleware = ({ adapterConfigs }) => {
      adapterConfigs.set('docLinkBaseUrl', 'https://example.com');
    };
    const mdAdapter = new MarkdownAdapter(createJob([middleware]), provider);
    const rawBlockSnapshot = await mdAdapter.toBlockSnapshot({
      file: markdown,
    });
    expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
  });

  describe('footnote', () => {
    const url = 'https://www.example.com';
    const favicon = 'https://www.example.com/favicon.ico';
    const title = 'Example Domain';
    const description = 'Example Domain';
    const blockSnapshot = {
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
                  insert: ' ',
                  attributes: {
                    footnote: {
                      label: '1',
                      reference: {
                        type: 'url',
                        url,
                        favicon,
                        title,
                        description,
                      },
                    },
                  },
                },
                {
                  insert: ' ',
                  attributes: {
                    footnote: {
                      label: '2',
                      reference: {
                        type: 'doc',
                        docId: 'deadbeef',
                      },
                    },
                  },
                },
                {
                  insert: ' ',
                  attributes: {
                    footnote: {
                      label: '3',
                      reference: {
                        type: 'attachment',
                        blobId: 'abcdefg',
                        fileName: 'test.txt',
                        fileType: 'text/plain',
                      },
                    },
                  },
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
            type: 'h6',
            text: {
              '$blocksuite:internal:text$': true,
              delta: [
                {
                  insert: 'Sources',
                },
              ],
            },
            collapsed: true,
          },
          children: [],
        },
        {
          type: 'block',
          id: 'matchesReplaceMap[3]',
          flavour: 'affine:bookmark',
          props: {
            style: 'citation',
            url,
            title,
            description,
            icon: favicon,
            footnoteIdentifier: '1',
          },
          children: [],
        },
        {
          type: 'block',
          id: 'matchesReplaceMap[4]',
          flavour: 'affine:embed-linked-doc',
          props: {
            style: 'citation',
            pageId: 'deadbeef',
            footnoteIdentifier: '2',
          },
          children: [],
        },
        {
          type: 'block',
          id: 'matchesReplaceMap[5]',
          flavour: 'affine:attachment',
          props: {
            name: 'test.txt',
            sourceId: 'abcdefg',
            footnoteIdentifier: '3',
            style: 'citation',
          },
          children: [],
        },
      ],
    };

    test('with encoded url and favicon', async () => {
      const encodedUrl = encodeURIComponent(url);
      const encodedFavicon = encodeURIComponent(favicon);
      const markdown = `aaa[^1][^2][^3]\n\n[^1]: {"type":"url","url":"${encodedUrl}","favicon":"${encodedFavicon}","title":"${title}","description":"${description}"}\n\n[^2]: {"type":"doc","docId":"deadbeef"}\n\n[^3]: {"type":"attachment","blobId":"abcdefg","fileName":"test.txt","fileType":"text/plain"}\n`;

      const mdAdapter = new MarkdownAdapter(createJob(), provider);
      const rawBlockSnapshot = await mdAdapter.toBlockSnapshot({
        file: markdown,
      });
      expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
    });

    test('with unencoded url and favicon', async () => {
      const markdown = `aaa[^1][^2][^3]\n\n[^1]: {"type":"url","url":"${url}","favicon":"${favicon}","title":"${title}","description":"${description}"}\n\n[^2]: {"type":"doc","docId":"deadbeef"}\n\n[^3]: {"type":"attachment","blobId":"abcdefg","fileName":"test.txt","fileType":"text/plain"}\n`;

      const mdAdapter = new MarkdownAdapter(createJob(), provider);
      const rawBlockSnapshot = await mdAdapter.toBlockSnapshot({
        file: markdown,
      });
      expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
    });

    test('should handle footnote reference with url prefix', async () => {
      const blockSnapshot = {
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
                    insert: 'https://example.com',
                    attributes: {
                      link: 'https://example.com',
                    },
                  },
                  {
                    insert: ' ',
                  },
                  {
                    insert: ' ',
                    attributes: {
                      footnote: {
                        label: '1',
                        reference: {
                          type: 'url',
                          url,
                          favicon,
                          title,
                          description,
                        },
                      },
                    },
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
              type: 'h6',
              text: {
                '$blocksuite:internal:text$': true,
                delta: [
                  {
                    insert: 'Sources',
                  },
                ],
              },
              collapsed: true,
            },
            children: [],
          },
          {
            type: 'block',
            id: 'matchesReplaceMap[3]',
            flavour: 'affine:bookmark',
            props: {
              style: 'citation',
              url,
              title,
              description,
              icon: favicon,
              footnoteIdentifier: '1',
            },
            children: [],
          },
        ],
      };

      const markdown = `https://example.com[^1]\n\n[^1]: {"type":"url","url":"${url}","favicon":"${favicon}","title":"${title}","description":"${description}"}\n`;

      const mdAdapter = new MarkdownAdapter(createJob(), provider);
      const rawBlockSnapshot = await mdAdapter.toBlockSnapshot({
        file: markdown,
      });
      expect(nanoidReplacement(rawBlockSnapshot)).toEqual(blockSnapshot);
    });
  });

  test('should not wrap url with angle brackets if it is not a url', async () => {
    const markdown = 'prompt: How many people will live in the world in 2040?';
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
                      insert:
                        'prompt: How many people will live in the world in 2040?',
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

    const mdAdapter = new MarkdownAdapter(createJob(), provider);
    const rawSliceSnapshot = await mdAdapter.toSliceSnapshot({
      file: markdown,
      workspaceId: '',
      pageId: '',
    });
    expect(nanoidReplacement(rawSliceSnapshot!)).toEqual(sliceSnapshot);
  });

  describe('callout', () => {
    const calloutBlockSnapshot: BlockSnapshot = {
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
          flavour: 'affine:callout',
          props: {
            emoji: '💬',
          },
          children: [
            {
              type: 'block',
              id: 'matchesReplaceMap[2]',
              flavour: 'affine:paragraph',
              props: {
                type: 'text',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [{ insert: 'This is a callout' }],
                },
              },
              children: [],
            },
          ],
        },
      ],
    };

    test('callout start with escape character', async () => {
      const markdown = '> \\[!💬]\n> This is a callout';
      const mdAdapter = new MarkdownAdapter(createJob(), provider);
      const rawBlockSnapshot = await mdAdapter.toBlockSnapshot({
        file: markdown,
      });
      expect(nanoidReplacement(rawBlockSnapshot)).toEqual(calloutBlockSnapshot);
    });

    test('callout start without escape character', async () => {
      const markdown = '> [!💬]\n> This is a callout';
      const mdAdapter = new MarkdownAdapter(createJob(), provider);
      const rawBlockSnapshot = await mdAdapter.toBlockSnapshot({
        file: markdown,
      });
      expect(nanoidReplacement(rawBlockSnapshot)).toEqual(calloutBlockSnapshot);
    });
  });
});
