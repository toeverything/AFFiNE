import 'fake-indexeddb/auto';

import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { Text } from '@blocksuite/affine/store';
import { TestWorkspace } from '@blocksuite/affine/store/test';
import { Framework } from '@toeverything/infra';
import { describe, expect, test } from 'vitest';

import { LocalMirrorSerializer } from '../serializer';

const extensions = getStoreManager().config.init().value.get('store');

describe('LocalMirrorSerializer', () => {
  test('creates deterministic Markdown and an id-preserving snapshot', async () => {
    const workspace = new TestWorkspace({ id: 'workspace' });
    workspace.meta.initialize();
    const store = workspace.createDoc('page0').getStore({ extensions });
    store.load();
    const rootId = store.addBlock('affine:page', {
      title: new Text('Agent notes'),
    });
    const noteId = store.addBlock('affine:note', {}, rootId);
    store.addBlock(
      'affine:paragraph',
      { text: new Text('Visible to the agent') },
      noteId
    );

    const framework = new Framework();
    framework.service(LocalMirrorSerializer);
    const serializer = framework.provider().get(LocalMirrorSerializer);
    const metadata = {
      id: 'page0',
      title: 'Agent notes',
      tags: ['research'],
      primaryMode: 'page' as const,
    };
    const docPaths = new Map([['page0', 'docs/Agent-notes.md']]);
    const first = await serializer.serialize(store, metadata, docPaths);
    const second = await serializer.serialize(store, metadata, docPaths);

    expect(first.sourceHash).toBe(second.sourceHash);
    expect(first.files).toEqual(second.files);
    const markdown = first.files.find(file => file.kind === 'markdown');
    const snapshot = first.files.find(file => file.kind === 'snapshot');
    expect(markdown?.content).toContain('Visible to the agent');
    expect(markdown?.content).toContain('docId: "page0"');
    expect(markdown?.path).toBe('docs/Agent-notes.md');
    expect(snapshot?.path).toBe('.metadata/snapshots/page0.snapshot.json');
    expect(snapshot?.content).toContain('"id": "page0"');
  });

  test('keeps mixed rich content and attachments agent-readable', async () => {
    const workspace = new TestWorkspace({ id: 'workspace' });
    workspace.meta.initialize();
    const attachment = new Blob(['attachment body'], { type: 'text/plain' });
    const sourceId = await workspace.blobSync.set(attachment);
    const linkedStore = workspace
      .createDoc('linked-page')
      .getStore({ extensions });
    linkedStore.load();
    linkedStore.addBlock('affine:page', {
      title: new Text('Linked project note'),
    });
    const store = workspace.createDoc('rich-page').getStore({ extensions });
    store.load();
    const rootId = store.addBlock('affine:page', {
      title: new Text('Rich project notes'),
    });
    const noteId = store.addBlock('affine:note', {}, rootId);
    store.addBlock(
      'affine:database',
      { columns: [], titleColumn: 'Title' },
      noteId
    );
    store.addBlock(
      'affine:bookmark',
      {
        url: 'https://example.com/reference',
        title: 'Project reference',
      },
      noteId
    );
    store.addBlock(
      'affine:embed-linked-doc',
      { pageId: 'linked-page' },
      noteId
    );
    store.addBlock(
      'affine:attachment',
      {
        name: 'brief.txt',
        sourceId,
        type: 'text/plain',
        size: attachment.size,
      },
      noteId
    );
    store.addBlock('affine:surface', {}, rootId);

    const framework = new Framework();
    framework.service(LocalMirrorSerializer);
    const serializer = framework.provider().get(LocalMirrorSerializer);
    const result = await serializer.serialize(
      store,
      {
        id: 'rich-page',
        title: 'Rich project notes',
        tags: [],
        primaryMode: 'edgeless',
      },
      new Map([
        ['rich-page', 'docs/Rich-project-notes.md'],
        ['linked-page', 'docs/Linked-project-note.md'],
      ])
    );

    const markdown = result.files.find(file => file.kind === 'markdown');
    const snapshot = result.files.find(file => file.kind === 'snapshot');
    const asset = result.assets[0];
    expect(markdown?.content).toContain('AFFiNE rich content');
    expect(markdown?.content).toContain('`affine:database`');
    expect(markdown?.content).toContain('`affine:surface`');
    expect(markdown?.content).toContain('## Attachments');
    expect(markdown?.content).toContain('../.metadata/assets/');
    expect(snapshot?.content).toContain('"flavour": "affine:database"');
    expect(snapshot?.content).toContain('"flavour": "affine:bookmark"');
    expect(snapshot?.content).toContain('"flavour": "affine:embed-linked-doc"');
    expect(snapshot?.content).toContain('"flavour": "affine:attachment"');
    expect(asset?.path).toMatch(/^\.metadata\/assets\//);
    expect(asset?.assetId).toBe(sourceId);
  });
});
