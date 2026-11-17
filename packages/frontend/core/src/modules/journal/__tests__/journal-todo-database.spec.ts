import { LiveData, yjsGetPath, yjsObserve } from '@toeverything/infra';
import { switchMap } from 'rxjs';
import { describe, expect, test } from 'vitest';
import { Doc as YDoc } from 'yjs';

import type { WorkspaceService } from '../../workspace';
import type { JournalTodoDatabaseRef } from '../store/journal-todo-database';
import { JournalTodoDatabaseStore } from '../store/journal-todo-database';

// The "current journal todo database" pointer (Story 2.4, Task 0) is plain
// Yjs map read/write on the workspace's own `rootYDoc` — no `Transformer`/
// `Slice` involved (unlike Story 2.3's `relocateDatabaseToAnotherDoc`), so
// a raw `Y.Doc` plus a minimal `WorkspaceService`-shaped stub is enough; no
// need for the heavier `TestWorkspace`/BlockSuite-collection harness that
// method required.
//
// `Store` (the infra base class) refuses direct `new` outside a real DI
// `Component`-provider context — worked around here via the established
// `Object.create(ServiceClass.prototype)` pattern for this exact same
// constraint. Unlike a plain-mock field, `journalTodoDatabaseRef$` is a
// class-field initializer (runs as part of
// the real constructor), which `Object.create` skips entirely — so it's
// rebuilt here inline, identically to the store's own definition, rather
// than left `undefined`.
function createStore(rootYDoc: YDoc = new YDoc()) {
  const workspaceService = {
    workspace: { rootYDoc },
  } as unknown as WorkspaceService;
  const raw = Object.create(JournalTodoDatabaseStore.prototype) as unknown as {
    workspaceService: WorkspaceService;
    journalTodoDatabaseRef$: LiveData<JournalTodoDatabaseRef | undefined>;
  };
  raw.workspaceService = workspaceService;
  raw.journalTodoDatabaseRef$ = LiveData.from(
    yjsGetPath(rootYDoc.getMap('meta'), 'journalTodoDatabaseRef').pipe(
      switchMap(yjsObserve),
      switchMap(value => [value as JournalTodoDatabaseRef | undefined])
    ),
    undefined
  );
  return raw as unknown as JournalTodoDatabaseStore;
}

describe('JournalTodoDatabaseStore', () => {
  test('reads undefined before anything is set', () => {
    const store = createStore();
    expect(store.getJournalTodoDatabaseRef()).toBeUndefined();
    expect(store.journalTodoDatabaseRef$.value).toBeUndefined();
  });

  test('persists and reads back the ref, reactively', () => {
    const store = createStore();
    const ref = { docId: 'doc-1', databaseId: 'db-1' };

    store.setJournalTodoDatabaseRef(ref);

    expect(store.getJournalTodoDatabaseRef()).toEqual(ref);
    expect(store.journalTodoDatabaseRef$.value).toEqual(ref);
  });

  test('overwriting the ref replaces the previous value entirely', () => {
    const store = createStore();
    store.setJournalTodoDatabaseRef({ docId: 'doc-1', databaseId: 'db-1' });
    store.setJournalTodoDatabaseRef({ docId: 'doc-2', databaseId: 'db-2' });

    expect(store.getJournalTodoDatabaseRef()).toEqual({
      docId: 'doc-2',
      databaseId: 'db-2',
    });
  });

  test('a second store instance over the same rootYDoc sees the same value (genuinely workspace-level, not per-instance)', () => {
    const rootYDoc = new YDoc();
    const storeA = createStore(rootYDoc);
    const storeB = createStore(rootYDoc);

    storeA.setJournalTodoDatabaseRef({ docId: 'doc-1', databaseId: 'db-1' });

    expect(storeB.getJournalTodoDatabaseRef()).toEqual({
      docId: 'doc-1',
      databaseId: 'db-1',
    });
  });
});
