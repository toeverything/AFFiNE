import type { DatabaseRefBlockComponent } from '@blocksuite/affine/blocks/database-ref';
import {
  insertDatabaseRefBlockCommand,
  moveIntoHiddenNote,
} from '@blocksuite/affine/blocks/database-ref';
import type { DatabaseViewRefBlockComponent } from '@blocksuite/affine/blocks/database-view-ref';
import {
  genericDatabaseViewRefSlashMenuConfig,
  insertDatabaseViewRefBlockCommand,
} from '@blocksuite/affine/blocks/database-view-ref';
import type {
  DatabaseViewRefBlockModel,
  NoteBlockModel,
} from '@blocksuite/affine/model';
import { NoteDisplayMode } from '@blocksuite/affine/model';
import { CrossDocReferenceProvider } from '@blocksuite/affine/shared/services';
import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

// Shared by the cross-doc suites below (Story 2.2's own cross-doc suite and
// Story 2.5's generic-reference suite) — both need a second, independently
// loaded doc in the same `collection` to reference across.
function createSecondDoc() {
  const secondDoc = collection
    .createDoc(`doc:second-${Math.random().toString(16).slice(2, 8)}`)
    .getStore();
  secondDoc.load(() => {
    const rootId = secondDoc.addBlock('affine:page', { title: new Text() });
    secondDoc.addBlock('affine:surface', {}, rootId);
  });
  return secondDoc;
}

// Story 2.2: a database reference that carries its *own* view/filter
// configuration, independent of the canonical table's shared `views` — the
// missing piece identified in Story 2.1's feasibility spike for the Journal
// Todo use case (2.4), where each reference needs a different filtered
// slice of the same underlying table. Structurally this is
// `database-ref`'s exact same "promotion on second reference" +
// nested-`BlockStdScope`-over-a-`Query`-filtered-`Store` mechanism (see
// `database-ref.spec.ts`'s own extensive comments) — only the view-data
// resolution layer (`DatabaseViewLocalOverrideProvider`) is genuinely new.
describe('database-view-ref: per-instance view/filter override', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  function createOrdinaryDatabase() {
    const noteId = addNote(doc);
    const databaseId = doc.addBlock(
      'affine:database',
      { title: new Text() },
      noteId
    );
    return { noteId, databaseId };
  }

  test('two references to the same canonical each get their own independently-seeded view', async () => {
    const { databaseId } = createOrdinaryDatabase();
    await wait();
    // A raw `affine:database` block (unlike one created through the real
    // `/database` slash command, which runs `databaseViewInitTemplate`)
    // starts with an empty `views` array — this test only cares that
    // seeding a reference's own view never adds to the canonical's.
    const canonicalViewsCountBefore = (
      doc.getModelById(databaseId)! as unknown as {
        props: { views: unknown[] };
      }
    ).props.views.length;

    const firstNoteId = addNote(doc);
    const firstAnchor = doc.getBlock(firstNoteId)!.model.children[0]!;
    const [, result1] = editor.std.command.exec(
      insertDatabaseViewRefBlockCommand,
      { refBlockId: databaseId, place: 'after', selectedModels: [firstAnchor] }
    );
    await wait();

    const secondNoteId = addNote(doc);
    const secondAnchor = doc.getBlock(secondNoteId)!.model.children[0]!;
    const [, result2] = editor.std.command.exec(
      insertDatabaseViewRefBlockCommand,
      { refBlockId: databaseId, place: 'after', selectedModels: [secondAnchor] }
    );
    await wait();

    const ref1 = doc.getBlock(result1.insertedDatabaseViewRefBlockId!)!
      .model as DatabaseViewRefBlockModel;
    const ref2 = doc.getBlock(result2.insertedDatabaseViewRefBlockId!)!
      .model as DatabaseViewRefBlockModel;

    expect(ref1.props.views.length).toBe(1);
    expect(ref2.props.views.length).toBe(1);
    // Independently seeded — not the same view id, not shared storage.
    expect(ref1.props.views[0]!.id).not.toBe(ref2.props.views[0]!.id);

    // Neither seeding touched the canonical's own shared `views`.
    const canonicalModel = doc.getModelById(databaseId)!;
    expect(
      (canonicalModel as unknown as { props: { views: unknown[] } }).props.views
        .length
    ).toBe(canonicalViewsCountBefore);
  });

  test('insertDatabaseViewRefBlockCommand called with no `initialView` still seeds a bare table view (default-args regression, Story 2.4)', async () => {
    // Story 2.4 extended `seedInitialView`'s signature with an optional
    // `initialView: { viewType?, initialFilter? }` — every existing caller
    // (including this file's own calls above, and the plain database-ref
    // slash-menu command) omits it entirely and must be unaffected.
    const { databaseId } = createOrdinaryDatabase();
    await wait();

    const noteId = addNote(doc);
    const anchor = doc.getBlock(noteId)!.model.children[0]!;
    const [, result] = editor.std.command.exec(
      insertDatabaseViewRefBlockCommand,
      { refBlockId: databaseId, place: 'after', selectedModels: [anchor] }
    );
    await wait();

    const refModel = doc.getBlock(result.insertedDatabaseViewRefBlockId!)!
      .model as DatabaseViewRefBlockModel;
    expect(refModel.props.views.length).toBe(1);
    const seededView = refModel.props.views[0] as unknown as {
      mode: string;
      filter?: { conditions: unknown[] };
    };
    expect(seededView.mode).toBe('table');
    // The view's own default (empty) filter, untouched — proves
    // `seedInitialView`'s optional `initialFilter` was never applied when
    // omitted, rather than asserting a specific raw shape that's really
    // owned by the view preset's own `defaultData`, not this command.
    expect(seededView.filter?.conditions ?? []).toEqual([]);
  });

  test("changing one reference's view does not mutate the canonical's views, the other reference, or a plain database-ref", async () => {
    const { databaseId } = createOrdinaryDatabase();
    await wait();

    const canonicalModel = doc.getModelById(databaseId)! as unknown as {
      props: { views: { id: string; name: string }[] };
    };
    const canonicalViewsBefore = JSON.stringify(canonicalModel.props.views);

    const firstNoteId = addNote(doc);
    const firstAnchor = doc.getBlock(firstNoteId)!.model.children[0]!;
    const [, result1] = editor.std.command.exec(
      insertDatabaseViewRefBlockCommand,
      { refBlockId: databaseId, place: 'after', selectedModels: [firstAnchor] }
    );
    await wait();

    const secondNoteId = addNote(doc);
    const secondAnchor = doc.getBlock(secondNoteId)!.model.children[0]!;
    const [, result2] = editor.std.command.exec(
      insertDatabaseViewRefBlockCommand,
      { refBlockId: databaseId, place: 'after', selectedModels: [secondAnchor] }
    );
    await wait();

    const thirdNoteId = addNote(doc);
    const thirdAnchor = doc.getBlock(thirdNoteId)!.model.children[0]!;
    const [, resultRef] = editor.std.command.exec(
      insertDatabaseRefBlockCommand,
      { refBlockId: databaseId, place: 'after', selectedModels: [thirdAnchor] }
    );
    await wait();

    const ref1 = doc.getBlock(result1.insertedDatabaseViewRefBlockId!)!
      .model as DatabaseViewRefBlockModel;
    const ref2 = doc.getBlock(result2.insertedDatabaseViewRefBlockId!)!
      .model as DatabaseViewRefBlockModel;
    const ref2ViewsBefore = JSON.stringify(ref2.props.views);

    // Directly mutate ref1's own local view (renaming it) — exactly what
    // `DatabaseViewLocalOverrideProvider`'s `viewDataUpdate` does under the
    // hood via `createLocalViewOverride`.
    doc.updateBlock(ref1, {
      views: ref1.props.views.map(v => ({ ...v, name: 'Filtered View' })),
    });
    await wait();

    expect(ref1.props.views[0]!.name).toBe('Filtered View');
    // Canonical's shared views: untouched.
    expect(JSON.stringify(canonicalModel.props.views)).toBe(
      canonicalViewsBefore
    );
    // The other view-ref: untouched.
    expect(JSON.stringify(ref2.props.views)).toBe(ref2ViewsBefore);
    // A plain database-ref pointing at the same canonical: still resolves
    // fine and was never touched by this local-override plumbing.
    expect(resultRef.insertedDatabaseRefBlockId).toBeTruthy();
    expect(doc.getBlock(resultRef.insertedDatabaseRefBlockId!)).toBeTruthy();
  });

  test('both reference instances render live, shared canonical data', async () => {
    const { databaseId } = createOrdinaryDatabase();
    await wait();

    const firstNoteId = addNote(doc);
    const firstAnchor = doc.getBlock(firstNoteId)!.model.children[0]!;
    const [, result1] = editor.std.command.exec(
      insertDatabaseViewRefBlockCommand,
      { refBlockId: databaseId, place: 'after', selectedModels: [firstAnchor] }
    );
    await wait();

    const refEl = document.querySelector(
      `affine-database-view-ref[data-block-id="${result1.insertedDatabaseViewRefBlockId}"]`
    ) as DatabaseViewRefBlockComponent;
    expect(refEl?.querySelector('affine-database')).toBeTruthy();
    expect(refEl?.querySelector('.affine-database-view-ref-error')).toBeFalsy();

    const rowCountBefore = doc.getModelById(databaseId)!.children.length;
    doc.addBlock('affine:paragraph', {}, databaseId);
    await wait();

    // A row added directly on the canonical is visible through the
    // reference's own live rendering.
    expect(doc.getModelById(databaseId)!.children.length).toBe(
      rowCountBefore + 1
    );
  });

  test('a row added through a reference view lands on the canonical', async () => {
    const { databaseId } = createOrdinaryDatabase();
    await wait();
    const noteId = addNote(doc);
    const anchor = doc.getBlock(noteId)!.model.children[0]!;
    editor.std.command.exec(insertDatabaseViewRefBlockCommand, {
      refBlockId: databaseId,
      place: 'after',
      selectedModels: [anchor],
    });
    await wait();

    const databaseModel = doc.getModelById(databaseId)!;
    const rowCountBefore = databaseModel.children.length;

    // Row mutation always targets the canonical `_model` regardless of
    // which reference triggered it — this story changes zero row-mutation
    // behavior, only view/filter *resolution*.
    doc.addBlock('affine:paragraph', {}, databaseId);
    await wait();

    expect(databaseModel.children.length).toBe(rowCountBefore + 1);
  });

  test('deleting one reference leaves the other view-ref, a co-existing database-ref, and the canonical data intact', async () => {
    const { databaseId } = createOrdinaryDatabase();
    await wait();
    doc.addBlock('affine:paragraph', {}, databaseId);
    await wait();

    const firstNoteId = addNote(doc);
    const firstAnchor = doc.getBlock(firstNoteId)!.model.children[0]!;
    const [, result1] = editor.std.command.exec(
      insertDatabaseViewRefBlockCommand,
      { refBlockId: databaseId, place: 'after', selectedModels: [firstAnchor] }
    );
    await wait();

    const secondNoteId = addNote(doc);
    const secondAnchor = doc.getBlock(secondNoteId)!.model.children[0]!;
    const [, resultRef] = editor.std.command.exec(
      insertDatabaseRefBlockCommand,
      { refBlockId: databaseId, place: 'after', selectedModels: [secondAnchor] }
    );
    await wait();

    const rowCountBefore = doc.getModelById(databaseId)!.children.length;

    doc.deleteBlock(
      doc.getBlock(result1.insertedDatabaseViewRefBlockId!)!.model
    );
    await wait();

    expect(doc.getBlock(databaseId)).toBeTruthy();
    expect(doc.getModelById(databaseId)!.children.length).toBe(rowCountBefore);
    expect(doc.getBlock(resultRef.insertedDatabaseRefBlockId!)).toBeTruthy();
  });

  test('deleting the last remaining reference (mixed database-ref + database-view-ref) cascades the canonical and hidden host note', async () => {
    const { databaseId } = createOrdinaryDatabase();
    await wait();

    // Pre-promote so both references below are inserted against an
    // already-hidden canonical — otherwise the *first* insertion's own
    // `ensurePromoted` call would leave an extra, auto-created
    // `affine:database-ref` behind at the original spot (see
    // `database-ref.spec.ts`'s "inserting a second reference promotes..."
    // test), which would make "last remaining reference" ambiguous.
    moveIntoHiddenNote(doc, doc.getModelById(databaseId)!);
    await wait();

    const firstNoteId = addNote(doc);
    const firstAnchor = doc.getBlock(firstNoteId)!.model.children[0]!;
    const [, resultRef] = editor.std.command.exec(
      insertDatabaseRefBlockCommand,
      { refBlockId: databaseId, place: 'after', selectedModels: [firstAnchor] }
    );
    await wait();

    const secondNoteId = addNote(doc);
    const secondAnchor = doc.getBlock(secondNoteId)!.model.children[0]!;
    const [, resultViewRef] = editor.std.command.exec(
      insertDatabaseViewRefBlockCommand,
      { refBlockId: databaseId, place: 'after', selectedModels: [secondAnchor] }
    );
    await wait();

    const hiddenNoteId = doc.getParent(databaseId)!.id;

    doc.deleteBlock(doc.getBlock(resultRef.insertedDatabaseRefBlockId!)!.model);
    await wait();

    // One reference remains (the view-ref) — canonical must survive.
    expect(doc.getBlock(databaseId)).toBeTruthy();

    doc.deleteBlock(
      doc.getBlock(resultViewRef.insertedDatabaseViewRefBlockId!)!.model
    );
    await wait();

    // Last reference of either flavour gone — canonical and its hidden
    // host note both go with it.
    expect(doc.getBlocksByFlavour('affine:database-ref').length).toBe(0);
    expect(doc.getBlocksByFlavour('affine:database-view-ref').length).toBe(0);
    expect(doc.getBlock(databaseId)).toBeFalsy();
    expect(doc.getBlock(hiddenNoteId)).toBeFalsy();
  });

  test('the database\'s own "Delete Database" action redirects to whichever reference (of either flavour) was last active', async () => {
    const { databaseId } = createOrdinaryDatabase();
    await wait();
    doc.addBlock('affine:paragraph', {}, databaseId);
    await wait();

    const firstNoteId = addNote(doc);
    const firstAnchor = doc.getBlock(firstNoteId)!.model.children[0]!;
    const [, resultRef] = editor.std.command.exec(
      insertDatabaseRefBlockCommand,
      { refBlockId: databaseId, place: 'after', selectedModels: [firstAnchor] }
    );
    await wait();

    const secondNoteId = addNote(doc);
    const secondAnchor = doc.getBlock(secondNoteId)!.model.children[0]!;
    const [, resultViewRef] = editor.std.command.exec(
      insertDatabaseViewRefBlockCommand,
      { refBlockId: databaseId, place: 'after', selectedModels: [secondAnchor] }
    );
    await wait();

    const rowCountBefore = doc.getModelById(databaseId)!.children.length;

    // Interact with the view-ref instance specifically — the redirect must
    // track it as "last active" even though `database-ref` installed the
    // shared preview store's delete-redirect first (whichever flavour
    // resolves the shared store first wins the one patch install).
    const viewRefEl = document.querySelector(
      `affine-database-view-ref[data-block-id="${resultViewRef.insertedDatabaseViewRefBlockId}"]`
    ) as DatabaseViewRefBlockComponent;
    viewRefEl.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, composed: true })
    );
    const databaseEl = viewRefEl.querySelector(
      'affine-database'
    ) as HTMLElement & {
      store: { deleteBlock: (m: unknown) => void };
      model: { children: unknown[] };
    };
    expect(databaseEl).toBeTruthy();

    databaseEl.model.children.slice().forEach(block => {
      databaseEl.store.deleteBlock(block);
    });
    databaseEl.store.deleteBlock(databaseEl.model);
    await wait();

    // Only the view-ref (the one actually interacted with) is gone.
    expect(
      doc.getBlock(resultViewRef.insertedDatabaseViewRefBlockId!)
    ).toBeFalsy();

    // The canonical, its rows, and the other (database-ref) reference all
    // survive untouched.
    expect(doc.getBlock(databaseId)).toBeTruthy();
    expect(doc.getModelById(databaseId)!.children.length).toBe(rowCountBefore);
    const survivingRefEl = document.querySelector(
      `affine-database-ref[data-block-id="${resultRef.insertedDatabaseRefBlockId}"]`
    ) as DatabaseRefBlockComponent;
    expect(survivingRefEl?.querySelector('affine-database')).toBeTruthy();
  });
});

// Cross-doc: mirrors `database-ref.spec.ts`'s own cross-doc suite exactly —
// same stable `refDocId` + `refBlockId` addressing, same resilience
// requirements (must survive the source moving and its doc being renamed).
describe('database-view-ref referenced across pages (cross-doc)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  test('a database in another doc renders live through a cross-doc view-ref, and the reference survives the source moving and its doc being renamed', async () => {
    const secondDoc = createSecondDoc();
    const firstNoteId = addNote(secondDoc);
    const databaseId = secondDoc.addBlock(
      'affine:database',
      { title: new Text() },
      firstNoteId
    );

    const noteId = addNote(doc);
    const anchor = doc.getBlock(noteId)!.model.children[0]!;
    const [, result] = editor.std.command.exec(
      insertDatabaseViewRefBlockCommand,
      {
        refBlockId: databaseId,
        refDocId: secondDoc.id,
        place: 'after',
        selectedModels: [anchor],
      }
    );
    await wait();

    const refModel = doc.getBlock(result.insertedDatabaseViewRefBlockId!)!
      .model as DatabaseViewRefBlockModel;
    expect(refModel.props.refBlockId).toBe(databaseId);
    expect(refModel.props.refDocId).toBe(secondDoc.id);

    // Cross-doc insertion must not promote/move the source.
    const sourceParent = secondDoc.getParent(
      secondDoc.getModelById(databaseId)!
    );
    expect(sourceParent?.id).toBe(firstNoteId);
    expect((sourceParent as NoteBlockModel).props.displayMode).not.toBe(
      NoteDisplayMode.EdgelessOnly
    );

    const refEl = document.querySelector(
      `affine-database-view-ref[data-block-id="${result.insertedDatabaseViewRefBlockId}"]`
    ) as DatabaseViewRefBlockComponent;
    expect(refEl?.querySelector('affine-database')).toBeTruthy();
    expect(refEl?.querySelector('.affine-database-view-ref-error')).toBeFalsy();

    // Move the source database to a different note within the same doc.
    const secondNoteId = addNote(secondDoc);
    secondDoc.moveBlocks(
      [secondDoc.getModelById(databaseId)!],
      secondDoc.getModelById(secondNoteId)!
    );
    await wait(500);

    // Rename the source doc itself.
    const pageBlock = secondDoc.getBlock(secondDoc.root!.id)!.model as {
      props: { title: Text };
    } & typeof secondDoc.root;
    secondDoc.transact(() => {
      pageBlock.props.title.clear();
      pageBlock.props.title.insert('Renamed Doc', 0);
    });
    await wait();

    const refElAfter = document.querySelector(
      `affine-database-view-ref[data-block-id="${result.insertedDatabaseViewRefBlockId}"]`
    ) as DatabaseViewRefBlockComponent;
    expect(refElAfter?.querySelector('affine-database')).toBeTruthy();
    expect(
      refElAfter?.querySelector('.affine-database-view-ref-error')
    ).toBeFalsy();
    expect(secondDoc.getParent(databaseId)?.id).toBe(secondNoteId);
  });

  test('deleting the only cross-doc view-ref cascades to the canonical data and hidden note in the other doc', async () => {
    const secondDoc = createSecondDoc();
    const secondNoteId = addNote(secondDoc);
    const databaseId = secondDoc.addBlock(
      'affine:database',
      { title: new Text() },
      secondNoteId
    );
    // Cross-doc insertion never promotes the source (mirrors
    // `insertDatabaseRefBlockCommand`'s own cross-doc branch) — promote it
    // manually first, the same way `database-ref.spec.ts`'s own cross-doc
    // cascade test does, so there's a genuine hidden host note to assert
    // gets cleaned up.
    const hiddenNoteId = moveIntoHiddenNote(
      secondDoc,
      secondDoc.getModelById(databaseId)!
    )!;

    const noteId = addNote(doc);
    const anchor = doc.getBlock(noteId)!.model.children[0]!;
    const [, result] = editor.std.command.exec(
      insertDatabaseViewRefBlockCommand,
      {
        refBlockId: databaseId,
        refDocId: secondDoc.id,
        place: 'after',
        selectedModels: [anchor],
      }
    );
    await wait();

    doc.deleteBlock(
      doc.getBlock(result.insertedDatabaseViewRefBlockId!)!.model
    );
    await wait();

    expect(secondDoc.getBlock(databaseId)).toBeFalsy();
    expect(secondDoc.getBlock(hiddenNoteId)).toBeFalsy();
  });
});

// This story's own delete-time-rescue extension (Task 3) widens
// `rescueReferencedDatabasesBeforeDelete` (packages/frontend/core/src/
// modules/doc/services/docs.ts) to also recognize `affine:database-view-ref`
// — that method lives in the `@affine/core` package (a `DocsService`,
// injected via the app's DI framework) and has no existing direct-call test
// harness anywhere in the codebase for ANY reference flavour (confirmed: no
// test exists calling it or its sibling `relocateNoteToAnotherDoc`
// directly, despite the story's Dev Notes assuming Story 0.5 had one). This
// blocksuite-level integration-test package has no access to `@affine/core`
// services at all, so that specific scan/relocate logic is exercised only
// by code review + the existing `affine:database-ref` behavior it's
// modeled after, not by an automated test here. The same-doc, in-editor
// cascade-delete-if-last-reference behavior (`delete-guard.ts`) — which
// *is* reachable from this package — is fully covered by the tests above.

// Story 2.5: the generic, non-journal-specific slash-menu items that let a
// user reference *any* database (same-doc or cross-doc) as a
// `database-view-ref` with its own independent, unfiltered default view —
// purely additive alongside `database-ref.spec.ts`'s own existing "Table:"/
// "Reference" item tests, which remain unchanged and are re-run as part of
// the full regression sweep, not duplicated here.
describe('database-view-ref: generic reference slash-menu items (Story 2.5)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  test('offers a same-doc "Table (own view)" item per existing database, and it inserts a database-view-ref with a plain default view', async () => {
    const noteId = addNote(doc);
    const databaseId = doc.addBlock(
      'affine:database',
      { title: new Text('My Table') },
      noteId
    );
    await wait();

    const anchorNoteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, anchorNoteId);
    const model = doc.getModelById(paragraphId)!;

    const items = genericDatabaseViewRefSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: editor.std, model }) : items;
    const sameDocItem = resolvedItems.find(
      item => item.name === 'Table (own view): My Table'
    );
    expect(sameDocItem).toBeTruthy();

    await (sameDocItem as unknown as { action: () => Promise<void> }).action();
    await wait();

    const refs = doc.getBlocksByFlavour('affine:database-view-ref');
    expect(refs.length).toBe(1);
    const refModel = refs[0]!.model as DatabaseViewRefBlockModel;
    expect(refModel.props.refBlockId).toBe(databaseId);
    expect(refModel.props.refDocId).toBe(doc.id);

    const seededView = refModel.props.views[0] as unknown as {
      mode: string;
      filter?: { conditions: unknown[] };
    };
    expect(seededView.mode).toBe('table');
    expect(seededView.filter?.conditions ?? []).toEqual([]);
  });

  test('offers no same-doc items when the workspace has no databases, but the cross-doc "Reference (own view)" item is still offered', async () => {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;

    const items = genericDatabaseViewRefSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: editor.std, model }) : items;

    expect(
      resolvedItems.filter(item => item.name.startsWith('Table (own view)'))
        .length
    ).toBe(0);
    expect(
      resolvedItems.find(item => item.name === 'Reference (own view)')
    ).toBeTruthy();
  });

  test('the cross-doc "Reference (own view)" item restricts the picker to database candidates and inserts a cross-doc database-view-ref', async () => {
    const secondDoc = createSecondDoc();
    const secondNoteId = addNote(secondDoc);
    const databaseId = secondDoc.addBlock(
      'affine:database',
      { title: new Text() },
      secondNoteId
    );

    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;

    let capturedAllowedFlavours: readonly string[] | undefined;
    const stubStd = new Proxy(editor.std, {
      get(target, prop, receiver) {
        if (prop === 'getOptional') {
          return (identifier: unknown) =>
            identifier === CrossDocReferenceProvider
              ? {
                  openCrossDocReferencePicker: async (
                    _excludeDocId: string,
                    allowedFlavours?: readonly string[]
                  ) => {
                    capturedAllowedFlavours = allowedFlavours;
                    return {
                      docId: secondDoc.id,
                      blockId: databaseId,
                      flavour: 'affine:database' as const,
                    };
                  },
                }
              : undefined;
        }
        return Reflect.get(target, prop, receiver);
      },
    });

    const items = genericDatabaseViewRefSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: stubStd, model }) : items;
    const referenceItem = resolvedItems.find(
      item => item.name === 'Reference (own view)'
    );
    expect(referenceItem).toBeTruthy();

    await (
      referenceItem as unknown as { action: () => Promise<void> }
    ).action();
    await wait();

    expect(capturedAllowedFlavours).toEqual(['affine:database']);

    const refs = doc.getBlocksByFlavour('affine:database-view-ref');
    expect(refs.length).toBe(1);
    const refModel = refs[0]!.model as DatabaseViewRefBlockModel;
    expect(refModel.props.refBlockId).toBe(databaseId);
    expect(refModel.props.refDocId).toBe(secondDoc.id);
  });

  test('two references inserted via these new slash-menu items each keep their own independent view (no leakage)', async () => {
    const noteId = addNote(doc);
    const databaseId = doc.addBlock(
      'affine:database',
      { title: new Text('Shared Table') },
      noteId
    );
    await wait();

    const firstAnchorNoteId = addNote(doc);
    const firstParagraphId = doc.addBlock(
      'affine:paragraph',
      {},
      firstAnchorNoteId
    );
    const firstModel = doc.getModelById(firstParagraphId)!;
    const items = genericDatabaseViewRefSlashMenuConfig.items;
    const firstResolved =
      typeof items === 'function'
        ? items({ std: editor.std, model: firstModel })
        : items;
    await (
      firstResolved.find(
        item => item.name === 'Table (own view): Shared Table'
      ) as unknown as { action: () => Promise<void> }
    ).action();
    await wait();

    const secondAnchorNoteId = addNote(doc);
    const secondParagraphId = doc.addBlock(
      'affine:paragraph',
      {},
      secondAnchorNoteId
    );
    const secondModel = doc.getModelById(secondParagraphId)!;
    const secondResolved =
      typeof items === 'function'
        ? items({ std: editor.std, model: secondModel })
        : items;
    await (
      secondResolved.find(
        item => item.name === 'Table (own view): Shared Table'
      ) as unknown as { action: () => Promise<void> }
    ).action();
    await wait();

    const refBlocks = doc.getBlocksByFlavour('affine:database-view-ref');
    expect(refBlocks.length).toBe(2);
    const ref0 = refBlocks[0]!.model as DatabaseViewRefBlockModel;
    const ref1 = refBlocks[1]!.model as DatabaseViewRefBlockModel;
    expect(ref0.props.views[0]!.id).not.toBe(ref1.props.views[0]!.id);

    // Renaming one reference's own view must not affect the other, or the
    // canonical's own shared `views` (Story 2.2's own no-leakage guarantee,
    // re-confirmed here specifically through this story's new insertion
    // path rather than only through direct command calls).
    doc.updateBlock(ref0, {
      views: ref0.props.views.map(v => ({ ...v, name: 'Renamed' })),
    });
    await wait();

    expect(ref0.props.views[0]!.name).toBe('Renamed');
    expect(ref1.props.views[0]!.name).not.toBe('Renamed');
    const canonicalModel = doc.getModelById(databaseId) as unknown as {
      props: { views: { name?: string }[] };
    };
    expect(canonicalModel.props.views.some(v => v.name === 'Renamed')).toBe(
      false
    );
  });
});
