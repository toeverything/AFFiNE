import 'fake-indexeddb/auto';

import { getStoreManager } from '@affine/core/blocksuite/manager/store';
import { Text } from '@blocksuite/affine/store';
import { TestWorkspace } from '@blocksuite/affine/store/test';
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

    const serializer = new LocalMirrorSerializer();
    const metadata = {
      id: 'page0',
      title: 'Agent notes',
      tags: ['research'],
      primaryMode: 'page' as const,
    };
    const first = await serializer.serialize(store, metadata, ['page0']);
    const second = await serializer.serialize(store, metadata, ['page0']);

    expect(first.sourceHash).toBe(second.sourceHash);
    expect(first.files).toEqual(second.files);
    const markdown = first.files.find(file => file.kind === 'markdown');
    const snapshot = first.files.find(file => file.kind === 'snapshot');
    expect(markdown?.content).toContain('Visible to the agent');
    expect(markdown?.content).toContain('docId: "page0"');
    expect(snapshot?.content).toContain('"id": "page0"');
  });
});
