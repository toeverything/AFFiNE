import type { PeerWorkspaceState } from '@affine/nbstore';
import { BehaviorSubject } from 'rxjs';
import { expect, test } from 'vitest';
import { Array as YArray, Doc as YDoc, Map as YMap } from 'yjs';

import { WorkspaceImpl } from './workspace';

test('cloud documents use inventory identity and preserve editors through raw metadata changes', () => {
  const root = new YDoc({ guid: 'cloud-workspace' });
  const pages = new YArray<YMap<unknown>>();
  root.getMap('meta').set('pages', pages);
  pages.push([
    new YMap<unknown>([
      ['id', 'live'],
      ['title', 'metadata title'],
      ['trash', true],
    ]),
    new YMap<unknown>([
      ['id', 'unclassified'],
      ['title', 'second'],
    ]),
  ]);
  root
    .getMap('spaces')
    .set('live', new YDoc({ guid: 'untrusted-subdoc-guid' }));
  const inventory = new BehaviorSubject<PeerWorkspaceState | null>({
    ready: true,
    cacheToken: 1,
    clocks: {},
    docs: [
      {
        docId: 'unclassified',
        timestamp: 2,
        lifecycle: null,
        lifecycleChangedAt: null,
      },
      {
        docId: 'live',
        timestamp: 1,
        lifecycle: null,
        lifecycleChangedAt: null,
      },
    ],
  });
  const titles = new BehaviorSubject<Record<string, string>>({
    live: 'Body live',
    unclassified: 'Body only',
  });
  const collection = new WorkspaceImpl({
    id: root.guid,
    rootDoc: root,
    inventory$: inventory,
    projectedTitles$: titles,
  });
  const live = collection.getDoc('live')!;
  expect(live.spaceDoc.guid).toBe('live');
  expect(collection.getDoc('unclassified')).not.toBeNull();
  expect(collection.meta.getDocMeta('live')).toMatchObject({
    title: 'metadata title',
    trash: false,
  });
  const projected = collection.meta.docMetas;
  expect(collection.meta.docMetas).toBe(projected);
  expect(collection.meta.getDocMeta('live')).toBe(
    projected.find(meta => meta.id === 'live')
  );
  let metadataEvents = 0;
  const metadataSubscription = collection.meta.docMetaUpdated.subscribe(() => {
    metadataEvents++;
  });
  root.transact(() => {
    pages.get(0).set('tags', ['first']);
    pages.get(1).set('tags', ['second']);
  });
  expect(metadataEvents).toBe(1);
  expect(collection.meta.docMetas).not.toBe(projected);
  expect(collection.meta.docMetas).toBe(collection.meta.docMetas);
  metadataSubscription.unsubscribe();
  let destroyed = false;
  live.spaceDoc.on('destroy', () => {
    destroyed = true;
  });
  collection.removeDoc('unclassified');
  expect(collection.getDoc('unclassified')).not.toBeNull();
  expect(collection.meta.getDocMeta('unclassified')?.title).toBe('Body only');
  expect(pages.get(0).get('id')).toBe('live');
  expect(pages.length).toBe(1);
  root.transact(() => pages.delete(0, 1), { force: true });
  expect(collection.getDoc('live')).toBe(live);
  expect(destroyed).toBe(false);
  expect(collection.meta.getDocMeta('live')?.title).toBe('Body live');
  let rawWrites = 0;
  root.on('update', () => {
    rawWrites++;
  });
  titles.next({ live: 'Updated body title' });
  expect(collection.meta.getDocMeta('live')?.title).toBe('Updated body title');
  expect(rawWrites).toBe(0);
  pages.push([
    new YMap<unknown>([
      ['id', 'unlisted'],
      ['trash', false],
    ]),
  ]);
  expect(collection.getDoc('unlisted')).toBeNull();
  root.transact(() => root.getMap('meta').set('pages', 42), { force: true });
  expect(collection.getDoc('live')).toBe(live);
  expect(destroyed).toBe(false);
  inventory.next({
    ...inventory.value!,
    docs: [
      {
        docId: 'live',
        timestamp: 1,
        lifecycle: 'trashed',
        lifecycleChangedAt: 3,
      },
    ],
  });
  expect(collection.getDoc('live')).toBe(live);
  expect(collection.meta.getDocMeta('live')).toMatchObject({
    trash: true,
    trashDate: 3,
  });
  inventory.next({ ...inventory.value!, docs: [] });
  expect(collection.getDoc('live')).toBeNull();
  expect(destroyed).toBe(true);
  expect((root.getMap('spaces').get('live') as YDoc).guid).toBe(
    'untrusted-subdoc-guid'
  );
  collection.dispose();
  root.destroy();

  const localRoot = new YDoc();
  const local = new WorkspaceImpl({ rootDoc: localRoot });
  local.meta.initialize();
  local.createDoc('local');
  expect(local.getDoc('local')).not.toBeNull();
  expect(local.meta.getDocMeta('local')).toBe(local.meta.docMetas[0]);
  local.meta.setDocMeta('local', { title: 'Local title' });
  expect(local.meta.getDocMeta('local')?.title).toBe('Local title');
  local.removeDoc('local');
  expect(local.meta.getDocMeta('local')).toBeUndefined();
  local.dispose();
  localRoot.destroy();
});
