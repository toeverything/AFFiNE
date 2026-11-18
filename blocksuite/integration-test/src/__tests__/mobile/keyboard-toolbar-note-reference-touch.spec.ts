import type {
  DatabaseRefBlockModel,
  NoteRefBlockModel,
} from '@blocksuite/affine/model';
import {
  CrossDocReferenceExtension,
  type CrossDocReferenceService,
} from '@blocksuite/affine/shared/services';
import {
  defaultKeyboardToolbarConfig,
  type KeyboardToolPanelConfig,
  type KeyboardToolPanelGroup,
} from '@blocksuite/affine-widget-keyboard-toolbar';
import { type BlockComponent, TextSelection } from '@blocksuite/std';
import { Text } from '@blocksuite/store';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';
import {
  registerStubVirtualKeyboardProviderForAllScopes,
  unregisterStubVirtualKeyboardProviderForAllScopes,
} from './utils.js';

// Phase 2, Plan 03 (MOBILE-09/D-04): pr/18's Note (`note-ref`) and Reference
// (`database-ref`) tools are unreachable via the slash menu on mobile for
// the identical architectural reason as Journal Todo/Calendar
// (`slash-menu-touch.spec.ts`'s live-verification test) -- this file proves
// the actual mobile reachability path instead: the keyboard-toolbar's "+"
// Database tool group, mirroring `keyboard-toolbar-database-touch.spec.ts`'s
// established structure.
function findDatabaseGroup(): KeyboardToolPanelGroup {
  const moreToolPanel = defaultKeyboardToolbarConfig.items.find(
    (item): item is KeyboardToolPanelConfig => 'groups' in item
  );
  expect(moreToolPanel).toBeTruthy();

  const databaseGroup = moreToolPanel?.groups.find(
    (group): group is KeyboardToolPanelGroup =>
      typeof group !== 'function' && group.name === 'Database'
  );
  expect(databaseGroup).toBeTruthy();

  return databaseGroup!;
}

describe('keyboard-toolbar Note/Reference touch reachability (Phase 2, MOBILE-09)', () => {
  let resolvePicker: CrossDocReferenceService['openCrossDocReferencePicker'] = (
    _excludeDocId,
    _allowedFlavours
  ) => Promise.resolve(null);

  beforeEach(async () => {
    // Phase 4 (MOBILE-12): the "Reference" tool-group action inserts an
    // `affine:database-ref` reference block, whose nested preview now also
    // builds the keyboard-toolbar widget's 'preview-page' scope registration
    // (`view.ts`'s Task 1 fix) — that nested `BlockStdScope` needs its own
    // `VirtualKeyboardProvider`, invisible to the plain
    // `createStubVirtualKeyboardExtension()` + `setupEditor` extensions-array
    // pattern this file used previously (see `mobile/utils.ts`'s own doc
    // comment on `registerStubVirtualKeyboardProviderForAllScopes`).
    registerStubVirtualKeyboardProviderForAllScopes();
    const cleanup = await setupEditor('page', [
      // Mirrors slash-menu-touch.spec.ts's own pattern: a stable extension
      // registered once per test, delegating to a per-test-reassignable
      // `resolvePicker` -- lets each test below swap in its own picker
      // behavior without re-registering the extension.
      CrossDocReferenceExtension({
        openCrossDocReferencePicker: (excludeDocId, allowedFlavours) =>
          resolvePicker(excludeDocId, allowedFlavours),
      }),
    ]);
    resolvePicker = () => Promise.resolve(null);
    return async () => {
      await cleanup();
      unregisterStubVirtualKeyboardProviderForAllScopes();
    };
  });

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

  async function selectFreshParagraph() {
    const noteId = addNote(doc);
    const paragraphId = doc.addBlock('affine:paragraph', {}, noteId);
    const model = doc.getModelById(paragraphId)!;

    const selection = editor.std.selection.create(TextSelection, {
      from: { blockId: paragraphId, index: 0, length: 0 },
      to: null,
    });
    editor.std.selection.setGroup('note', [selection]);
    await wait();

    return { paragraphId, model };
  }

  test('the keyboard-toolbar\'s "New note" item creates a reusable note and inserts a note-ref, matching the slash-menu\'s own "New note" item', async () => {
    await selectFreshParagraph();

    const databaseGroup = findDatabaseGroup();
    const newNoteItem = databaseGroup.items.find(
      item => item.name === 'New note'
    );
    expect(newNoteItem).toBeTruthy();

    const noteBlocksBefore = doc.getBlocksByFlavour('affine:note');

    await newNoteItem!.action?.({
      std: editor.std,
      rootComponent: {} as BlockComponent,
      closeToolPanel: () => {},
    });
    await wait();

    const noteBlocksAfter = doc.getBlocksByFlavour('affine:note');
    // A brand-new canonical note was created (the "reusable note"), on top
    // of the note already added by `selectFreshParagraph`/`addNote`.
    expect(noteBlocksAfter.length).toBe(noteBlocksBefore.length + 1);

    const refEl = document.querySelector('affine-note-ref') as HTMLElement & {
      model: NoteRefBlockModel;
    };
    expect(refEl).toBeTruthy();
    const refModel = refEl.model;
    expect(refModel.props.refDocId).toBe(doc.id);
    const canonicalModel = doc.getBlock(refModel.props.refBlockId)?.model;
    expect(canonicalModel?.flavour).toBe('affine:note');
  });

  test('the keyboard-toolbar\'s "Reference" item opens the cross-doc picker DI seam and inserts the correct block type per candidate flavour', async () => {
    const secondDoc = createSecondDoc();
    const secondNoteId = addNote(secondDoc);
    const databaseId = secondDoc.addBlock(
      'affine:database',
      { title: new Text() },
      secondNoteId
    );

    let capturedExcludeDocId: string | null | undefined;
    resolvePicker = excludeDocId => {
      capturedExcludeDocId = excludeDocId;
      return Promise.resolve({
        docId: secondDoc.id,
        blockId: databaseId,
        flavour: 'affine:database' as const,
      });
    };

    await selectFreshParagraph();

    const databaseGroup = findDatabaseGroup();
    const referenceItem = databaseGroup.items.find(
      item => item.name === 'Reference'
    );
    expect(referenceItem).toBeTruthy();

    await referenceItem!.action?.({
      std: editor.std,
      rootComponent: {} as BlockComponent,
      closeToolPanel: () => {},
    });
    await wait();

    // Proves the seam threads the real invoking doc/std through correctly
    // under touch, matching slash-menu-touch.spec.ts's own assertion for
    // the desktop path.
    expect(capturedExcludeDocId).toBe(doc.id);

    const refs = doc.getBlocksByFlavour('affine:database-ref');
    expect(refs.length).toBe(1);
    const refModel = refs[0]!.model as unknown as DatabaseRefBlockModel;
    expect(refModel.props.refBlockId).toBe(databaseId);
    expect(refModel.props.refDocId).toBe(secondDoc.id);

    const refEl = document.querySelector('affine-database-ref') as HTMLElement;
    expect(refEl).toBeTruthy();
  });
});
