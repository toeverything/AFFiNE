/**
 * @vitest-environment happy-dom
 */

import { getInternalStoreExtensions } from '@blocksuite/affine/extensions/store';
import type {
  DatabaseRefBlockModel,
  DatabaseViewRefBlockModel,
  NoteBlockModel,
} from '@blocksuite/affine/model';
import { NoteDisplayMode } from '@blocksuite/affine/model';
import { StoreExtensionManager } from '@blocksuite/affine-ext-loader';
import type { Store } from '@blocksuite/store';
import {
  createAutoIncrementIdGenerator,
  TestWorkspace,
} from '@blocksuite/store/test';
import { beforeEach, describe, expect, test } from 'vitest';

import { DocsService } from '../services/docs';

// `relocateDatabaseToAnotherDoc` (Story 2.3) — like its sibling
// `relocateNoteToAnotherDoc` (Story 0.5) — has no existing test harness
// anywhere in the repo, since it lives in `@affine/core`'s `DocsService`
// (a real DI service driving a real BlockSuite `Transformer`/`Slice` over
// real `Store` objects), which `blocksuite/integration-test` cannot reach
// at all (confirmed directly: see `database-view-ref.spec.ts`'s own
// comment on this exact gap). This test builds the minimum viable real
// harness instead of mocking around it: a genuine, in-memory
// `TestWorkspace` (the same one `blocksuite/affine/all`'s own unit tests
// use, e.g. `database.unit.spec.ts`) with the real, fully-registered block
// schema (`getInternalStoreExtensions()`, the same set the real app
// registers), plus a `DocsService` instance built via
// `Object.create(DocsService.prototype)` (an established mocking pattern
// for this package) with only `store` stubbed to delegate to the real
// `TestWorkspace` — everything else (`Transformer`, `Slice`, the actual
// relocation/repoint logic) runs for real, unmocked.
function createTestCollection() {
  const extensions = new StoreExtensionManager(
    getInternalStoreExtensions()
  ).get('store');
  const idGenerator = createAutoIncrementIdGenerator();
  const collection = new TestWorkspace({ id: 'test-collection', idGenerator });
  collection.meta.initialize();

  const createDoc = (docId: string) => {
    const doc = collection.createDoc(docId);
    doc.load();
    const store = doc.getStore({ extensions });
    store.addBlock('affine:page', {});
    return store;
  };

  return { collection, createDoc };
}

function createTestDocsService(collection: TestWorkspace) {
  const extensions = new StoreExtensionManager(
    getInternalStoreExtensions()
  ).get('store');
  // `store` is a `private readonly` constructor param property on
  // `DocsService` — intersecting the class type with a redeclared `store`
  // field (as this used to) collapses the *whole* intersection to `never`
  // (the private member conflicts with the public redeclaration), so the
  // stub is written through a separately-typed `Record<string, unknown>`
  // view instead (mirrors `note-ref.spec.ts`'s own fix for this exact
  // TypeScript quirk).
  const service = Object.create(DocsService.prototype) as DocsService;
  const serviceInternals = service as unknown as Record<string, unknown>;
  serviceInternals.store = {
    getBlocksuiteCollection: () => collection,
    getBlockSuiteDoc: (id: string) =>
      collection.getDoc(id)?.getStore({ extensions }) ?? null,
  };
  return service;
}

describe('DocsService.relocateDatabaseToAnotherDoc', () => {
  let collection: TestWorkspace;
  let createDoc: (docId: string) => Store;
  let docsService: DocsService;

  beforeEach(() => {
    const setup = createTestCollection();
    collection = setup.collection;
    createDoc = setup.createDoc;
    docsService = createTestDocsService(collection);
  });

  test('moving a bare, never-promoted database wraps it in a new visible note at the destination', () => {
    const sourceDoc = createDoc('source');
    const destDoc = createDoc('dest');

    const sourceNoteId = sourceDoc.addBlock(
      'affine:note',
      {},
      sourceDoc.root!.id
    );
    const databaseId = sourceDoc.addBlock('affine:database', {}, sourceNoteId);
    const rowId = sourceDoc.addBlock('affine:paragraph', {}, databaseId);

    return docsService
      .relocateDatabaseToAnotherDoc('source', databaseId, 'dest')
      .then(result => {
        expect(result).toBe(true);

        // Gone from the source.
        expect(sourceDoc.getBlock(databaseId)).toBeFalsy();

        // Present at the destination, same id, row preserved, and the
        // destination note is genuinely visible (not EdgelessOnly).
        const movedDatabase = destDoc.getBlock(databaseId)?.model;
        expect(movedDatabase).toBeTruthy();
        expect(destDoc.getBlock(rowId)).toBeTruthy();

        const parent = destDoc.getParent(movedDatabase!) as
          | NoteBlockModel
          | undefined;
        expect(parent?.flavour).toBe('affine:note');
        // Positive assertion (not just "not EdgelessOnly") — the note's
        // `displayMode` must actually resolve to the schema default
        // (`DocAndEdgeless`), proving it's genuinely a visible page-mode
        // note rather than merely "some other, still-unverified" value.
        expect(parent?.props.displayMode).toBe(NoteDisplayMode.DocAndEdgeless);
        // Regression: this new host note must not show the page-mode
        // border a plain secondary note defaults to (`_showBorder` falls
        // back to `!isPageBlock()`, which is `true` for any non-primary
        // note) — the note exists purely to host the moved database, not
        // to read as "a distinct note" the way a real `/note` would.
        expect(parent?.props.pageBorder).toBe(false);
      });
  });

  test('moving an already-promoted database (hidden note) relocates the whole note as a unit', () => {
    const sourceDoc = createDoc('source');
    const destDoc = createDoc('dest');

    const hiddenNoteId = sourceDoc.addBlock(
      'affine:note',
      { displayMode: NoteDisplayMode.EdgelessOnly },
      sourceDoc.root!.id
    );
    const databaseId = sourceDoc.addBlock('affine:database', {}, hiddenNoteId);

    return docsService
      .relocateDatabaseToAnotherDoc('source', databaseId, 'dest')
      .then(result => {
        expect(result).toBe(true);

        expect(sourceDoc.getBlock(hiddenNoteId)).toBeFalsy();
        expect(sourceDoc.getBlock(databaseId)).toBeFalsy();

        const movedDatabase = destDoc.getBlock(databaseId)?.model;
        expect(movedDatabase).toBeTruthy();
        const parent = destDoc.getParent(movedDatabase!) as
          | NoteBlockModel
          | undefined;
        expect(parent?.flavour).toBe('affine:note');
        expect(parent?.props.displayMode).toBe(NoteDisplayMode.EdgelessOnly);
      });
  });

  test('repoints both database-ref and database-view-ref instances (same-doc and cross-doc) to the destination', () => {
    const sourceDoc = createDoc('source');
    createDoc('dest');
    const otherDoc = createDoc('other');

    const sourceNoteId = sourceDoc.addBlock(
      'affine:note',
      {},
      sourceDoc.root!.id
    );
    const databaseId = sourceDoc.addBlock('affine:database', {}, sourceNoteId);

    const otherNoteId = otherDoc.addBlock('affine:note', {}, otherDoc.root!.id);
    const refId = otherDoc.addBlock(
      'affine:database-ref',
      { refBlockId: databaseId, refDocId: 'source' },
      otherNoteId
    );
    const viewRefId = otherDoc.addBlock(
      'affine:database-view-ref',
      { refBlockId: databaseId, refDocId: 'source', views: [] },
      otherNoteId
    );

    return docsService
      .relocateDatabaseToAnotherDoc('source', databaseId, 'dest')
      .then(result => {
        expect(result).toBe(true);

        const refModel = otherDoc.getBlock(refId)?.model as
          | DatabaseRefBlockModel
          | undefined;
        const viewRefModel = otherDoc.getBlock(viewRefId)?.model as
          | DatabaseViewRefBlockModel
          | undefined;
        expect(refModel?.props.refDocId).toBe('dest');
        expect(refModel?.props.refBlockId).toBe(databaseId);
        expect(viewRefModel?.props.refDocId).toBe('dest');
        expect(viewRefModel?.props.refBlockId).toBe(databaseId);
      });
  });

  test('resolves false when the source database does not exist', () => {
    createDoc('source');
    createDoc('dest');

    return docsService
      .relocateDatabaseToAnotherDoc('source', 'not-a-real-id', 'dest')
      .then(result => {
        expect(result).toBe(false);
      });
  });

  test('resolves false as a no-op when source and destination are the same doc', () => {
    const sourceDoc = createDoc('source');
    const sourceNoteId = sourceDoc.addBlock(
      'affine:note',
      {},
      sourceDoc.root!.id
    );
    const databaseId = sourceDoc.addBlock('affine:database', {}, sourceNoteId);

    return docsService
      .relocateDatabaseToAnotherDoc('source', databaseId, 'source')
      .then(result => {
        expect(result).toBe(false);
        // Untouched — still exactly where it started.
        expect(sourceDoc.getBlock(databaseId)).toBeTruthy();
      });
  });

  test('resolves false when the destination doc already has a block with the same id', () => {
    const sourceDoc = createDoc('source');
    const destDoc = createDoc('dest');

    const sourceNoteId = sourceDoc.addBlock(
      'affine:note',
      {},
      sourceDoc.root!.id
    );
    const databaseId = sourceDoc.addBlock('affine:database', {}, sourceNoteId);

    // Simulate a prior partial/failed move: the destination already
    // resolves this exact id (e.g. a stray leftover paragraph reusing it).
    const destNoteId = destDoc.addBlock('affine:note', {}, destDoc.root!.id);
    destDoc.addBlock('affine:paragraph', { id: databaseId }, destNoteId);

    return docsService
      .relocateDatabaseToAnotherDoc('source', databaseId, 'dest')
      .then(result => {
        expect(result).toBe(false);
        // Untouched — the guard fired before anything was moved.
        expect(sourceDoc.getBlock(databaseId)?.model.flavour).toBe(
          'affine:database'
        );
      });
  });
});
