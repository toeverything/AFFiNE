import 'fake-indexeddb/auto';

import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { getAFFiNEWorkspaceSchema } from '@affine/core/modules/workspace';
import type { DocSnapshot } from '@blocksuite/affine/store';
import { TestWorkspace } from '@blocksuite/affine/store/test';
import type { ImportBatch } from '@blocksuite/affine/widgets/linked-doc';
import { describe, expect, test, vi } from 'vitest';

import { ImportCommitService } from './commit-service';

function docSnapshot(id: string, title: string): DocSnapshot {
  return {
    type: 'page',
    meta: {
      id,
      title,
      createDate: 0,
      tags: [],
    },
    blocks: {
      type: 'block',
      id: `block:${id}`,
      flavour: 'affine:page',
      props: {
        title: {
          '$blocksuite:internal:text$': true,
          delta: [{ insert: title }],
        },
      },
      children: [
        {
          type: 'block',
          id: `block:${id}:note`,
          flavour: 'affine:note',
          props: {},
          children: [
            {
              type: 'block',
              id: `block:${id}:paragraph`,
              flavour: 'affine:paragraph',
              props: {
                type: 'text',
                text: {
                  '$blocksuite:internal:text$': true,
                  delta: [{ insert: title }],
                },
              },
              children: [],
            },
          ],
        },
      ],
    },
  };
}

function createFolderTree() {
  const folders = new Map<string, FolderNode>();
  const links: { parentId: string; docId: string }[] = [];
  let nextId = 0;

  class FolderNode {
    readonly children: string[] = [];

    constructor(readonly id: string) {
      folders.set(id, this);
    }

    createFolder() {
      const id = `folder-${++nextId}`;
      this.children.push(id);
      new FolderNode(id);
      return id;
    }

    createLink(...[, docId]: ['doc', string]) {
      links.push({ parentId: this.id, docId });
    }

    indexAt() {
      return 'after';
    }
  }

  const rootFolder = new FolderNode('root');
  return {
    links,
    service: {
      folderTree: {
        rootFolder,
        ['folderNode$']: (id: string) => ({ value: folders.get(id) }),
      },
    },
  };
}

function createCommitService(
  collection: TestWorkspace,
  options: {
    organizeService?: unknown;
    explorerIconService?: unknown;
    tagService?: unknown;
  } = {}
) {
  return new ImportCommitService({
    collection,
    schema: getAFFiNEWorkspaceSchema(),
    extensions: getStoreManager().config.init().value.get('store'),
    organizeService: options.organizeService as never,
    explorerIconService: options.explorerIconService as never,
    tagService: options.tagService as never,
    logger: {
      warn: vi.fn(),
    },
  });
}

describe('ImportCommitService', () => {
  test('commits native batch blobs, docs, folders, icons, and warnings', async () => {
    const collection = new TestWorkspace({ id: 'test' });
    collection.meta.initialize();
    const folderTree = createFolderTree();
    const setIcon = vi.fn();
    const service = createCommitService(collection, {
      organizeService: folderTree.service,
      explorerIconService: { setIcon },
    });

    const batch: ImportBatch = {
      blobs: [
        {
          blobId: 'blob-1',
          sourcePath: 'assets/image.png',
          fileName: 'image.png',
          mime: 'image/png',
          bytes: new Uint8Array([1, 2, 3]),
        },
      ],
      docs: [
        {
          id: 'doc-1',
          snapshot: docSnapshot('doc-1', 'Imported'),
          meta: { title: 'Committed title', favorite: true },
        },
      ],
      folders: [
        { path: 'root-folder', name: 'Root folder' },
        {
          path: 'root-folder/doc-1',
          name: 'Imported',
          parentPath: 'root-folder',
          pageId: 'doc-1',
          icon: { type: 'emoji', unicode: '✅' },
        },
      ],
      warnings: [{ code: 'lossy', message: 'Dropped unsupported block' }],
      done: true,
    };

    const result = await service.commitBatch(batch);

    expect(result).toEqual({
      docIds: ['doc-1'],
      rootFolderId: 'folder-1',
      warnings: batch.warnings,
    });
    await expect(collection.blobSync.get('blob-1')).resolves.toBeInstanceOf(
      File
    );
    expect(collection.getDoc('doc-1')).not.toBeNull();
    expect(collection.meta.getDocMeta('doc-1')).toMatchObject({
      title: 'Committed title',
      favorite: true,
    });
    expect(folderTree.links).toEqual([
      { parentId: 'folder-1', docId: 'doc-1' },
    ]);
    expect(setIcon).toHaveBeenCalledWith({
      where: 'doc',
      id: 'doc-1',
      icon: { type: 'emoji', unicode: '✅' },
    });
  });

  test('commits native tag names as workspace tags', async () => {
    const collection = new TestWorkspace({ id: 'test' });
    collection.meta.initialize();
    const tags = new Map<string, { id: string; value: string }>();
    const service = createCommitService(collection, {
      tagService: {
        randomTagColor: () => 'red',
        tagList: {
          ['tags$']: {
            value: [],
          },
          createTag: (value: string) => {
            const tag = { id: `tag-${tags.size + 1}`, value };
            tags.set(value, tag);
            return tag;
          },
        },
      },
    });

    await service.commitBatch({
      blobs: [],
      docs: [
        {
          id: 'doc-1',
          snapshot: docSnapshot('doc-1', 'Tagged'),
          meta: { tags: ['Blue Tag'], title: 'Tagged' },
        },
      ],
      tags: [{ name: 'work/project', docIds: ['doc-1'] }],
      done: true,
    });

    expect([...tags.values()]).toEqual([
      { id: 'tag-1', value: 'Blue Tag' },
      { id: 'tag-2', value: 'work' },
    ]);
    expect(collection.meta.getDocMeta('doc-1')?.tags).toEqual([
      'tag-1',
      'tag-2',
    ]);
  });

  test('commits batch folders, icons, and collapsed Bear root tags', async () => {
    const collection = new TestWorkspace({ id: 'test' });
    collection.meta.initialize();
    collection.createDoc('doc-1');
    collection.createDoc('doc-2');
    const folderTree = createFolderTree();
    const setIcon = vi.fn();
    const tags = new Map<string, { id: string; value: string }>();
    const service = createCommitService(collection, {
      organizeService: folderTree.service,
      explorerIconService: { setIcon },
      tagService: {
        randomTagColor: () => 'red',
        tagList: {
          ['tags$']: {
            value: [],
          },
          createTag: (value: string) => {
            const tag = { id: `tag-${tags.size + 1}`, value };
            tags.set(value, tag);
            return tag;
          },
        },
      },
    });

    const result = await service.commitBatch({
      docs: [],
      blobs: [],
      icons: [{ docId: 'doc-1', icon: { type: 'emoji', unicode: '📘' } }],
      tags: [
        { name: 'work/project', docIds: ['doc-1'] },
        { name: 'work/research', docIds: ['doc-2'] },
      ],
      folders: [
        { path: 'Bear', name: 'Bear' },
        {
          path: 'Bear/Idea',
          name: 'Idea',
          parentPath: 'Bear',
          pageId: 'doc-1',
        },
      ],
      done: true,
    });

    expect(result).toEqual({
      docIds: [],
      rootFolderId: 'folder-1',
      warnings: [],
    });
    expect(folderTree.links).toEqual([
      { parentId: 'folder-1', docId: 'doc-1' },
    ]);
    expect(setIcon).toHaveBeenCalledWith({
      where: 'doc',
      id: 'doc-1',
      icon: { type: 'emoji', unicode: '📘' },
    });
    expect([...tags.values()]).toEqual([{ id: 'tag-1', value: 'work' }]);
    expect(collection.meta.getDocMeta('doc-1')?.tags).toEqual(['tag-1']);
    expect(collection.meta.getDocMeta('doc-2')?.tags).toEqual(['tag-1']);
  });

  test('keeps folder and doc links idempotent across repeated commits', async () => {
    const collection = new TestWorkspace({ id: 'test' });
    collection.meta.initialize();
    collection.createDoc('doc-1');
    const folderTree = createFolderTree();
    const service = createCommitService(collection, {
      organizeService: folderTree.service,
    });
    const batch: ImportBatch = {
      docs: [],
      blobs: [],
      folders: [
        { path: 'Root', name: 'Root' },
        {
          path: 'Root/Doc',
          name: 'Doc',
          parentPath: 'Root',
          pageId: 'doc-1',
        },
      ],
      done: true,
    };

    const first = await service.commitBatch(batch);
    const second = await service.commitBatch(batch);

    expect(first.rootFolderId).toBe('folder-1');
    expect(second.rootFolderId).toBe('folder-1');
    expect(folderTree.links).toEqual([
      { parentId: 'folder-1', docId: 'doc-1' },
    ]);
  });

  test('resolves partial batch folder links when parent arrives later', async () => {
    const collection = new TestWorkspace({ id: 'test' });
    collection.meta.initialize();
    collection.createDoc('doc-1');
    const folderTree = createFolderTree();
    const service = createCommitService(collection, {
      organizeService: folderTree.service,
    });

    await service.commitBatch({
      docs: [],
      blobs: [],
      folders: [
        {
          path: 'Root/Doc',
          name: 'Doc',
          parentPath: 'Root',
          pageId: 'doc-1',
        },
      ],
      done: true,
    });
    await service.commitBatch({
      docs: [],
      blobs: [],
      folders: [{ path: 'Root', name: 'Root' }],
      done: true,
    });

    expect(folderTree.links).toEqual([
      { parentId: 'folder-1', docId: 'doc-1' },
    ]);
  });

  test('keeps Notion page nodes usable as child containers', async () => {
    const collection = new TestWorkspace({ id: 'test' });
    collection.meta.initialize();
    collection.createDoc('project');
    collection.createDoc('nested');
    const folderTree = createFolderTree();
    const service = createCommitService(collection, {
      organizeService: folderTree.service,
    });

    await service.commitBatch({
      docs: [],
      blobs: [],
      folders: [
        { path: 'Export', name: 'Export' },
        {
          path: 'Export/Project',
          name: 'Project',
          parentPath: 'Export',
          pageId: 'project',
        },
        {
          path: 'Export/Project/Nested',
          name: 'Nested',
          parentPath: 'Export/Project',
          pageId: 'nested',
        },
      ],
      done: true,
    });

    expect(folderTree.links).toEqual([
      { parentId: 'folder-1', docId: 'project' },
      { parentId: 'folder-2', docId: 'nested' },
    ]);
  });
});
