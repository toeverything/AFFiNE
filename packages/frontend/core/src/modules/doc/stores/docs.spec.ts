import { Framework } from '@toeverything/infra';
import { describe, expect, test } from 'vitest';
import type { Map as YMap } from 'yjs';
import { Array as YArray, Doc as YDoc } from 'yjs';

import type { WorkspaceService } from '../../workspace';
import type { DocPropertiesStore } from './doc-properties';
import { DocsStore } from './docs';

function createStore() {
  const rootYDoc = new YDoc();
  rootYDoc.getMap('meta').set('pages', new YArray());
  const workspaceService = {
    workspace: { rootYDoc },
  } as unknown as WorkspaceService;
  const docPropertiesStore = {} as DocPropertiesStore;

  const framework = new Framework();
  framework.store(
    DocsStore,
    () => new DocsStore(workspaceService, docPropertiesStore)
  );
  const store = framework.provider().get(DocsStore);
  return { store, rootYDoc };
}

function pages(rootYDoc: YDoc) {
  return (
    rootYDoc.getMap('meta').get('pages') as YArray<YMap<unknown>>
  ).toArray();
}

describe('DocsStore.createDoc', () => {
  // https://github.com/toeverything/AFFiNE/issues/15629
  test('re-creating an existing doc id does not push a duplicate meta.pages entry', () => {
    const { store, rootYDoc } = createStore();

    store.createDoc('doc-1');
    store.createDoc('doc-1');

    const entries = pages(rootYDoc).filter(page => page.get('id') === 'doc-1');
    expect(entries).toHaveLength(1);
  });

  test('re-creating an existing doc id preserves its original createDate', () => {
    const { store, rootYDoc } = createStore();

    store.createDoc('doc-1');
    const originalCreateDate = pages(rootYDoc)[0]?.get('createDate');

    store.createDoc('doc-1');

    const entry = pages(rootYDoc).find(page => page.get('id') === 'doc-1');
    expect(entry?.get('createDate')).toBe(originalCreateDate);
  });

  test('still creates a fresh doc id normally', () => {
    const { store, rootYDoc } = createStore();

    const { id } = store.createDoc();

    expect(pages(rootYDoc)).toHaveLength(1);
    expect(pages(rootYDoc)[0]?.get('id')).toBe(id);
  });

  test('reports isNew so callers can skip resetting createdAt on reuse', () => {
    const { store } = createStore();

    expect(store.createDoc('doc-1').isNew).toBe(true);
    expect(store.createDoc('doc-1').isNew).toBe(false);
  });
});
