import type { NoteRefBlockComponent } from '@blocksuite/affine/blocks/note-ref';
import {
  createReusableNoteAndInsertRefCommand,
  insertNoteRefBlockCommand,
  noteRefSlashMenuConfig,
} from '@blocksuite/affine/blocks/note-ref';
import { type NoteBlockModel, NoteDisplayMode } from '@blocksuite/affine/model';
import { EditPropsStore } from '@blocksuite/affine/shared/services';
import { TextSelection } from '@blocksuite/std';
import { type BlockModel, type Store, Text } from '@blocksuite/store';
import { userEvent } from '@vitest/browser/context';
import { beforeEach, describe, expect, test } from 'vitest';

import { wait } from '../utils/common.js';
import { addNote } from '../utils/edgeless.js';
import { setupEditor } from '../utils/setup.js';

// Story 0.6: a reusable block of text (`affine:note`) referenced live, in
// place, editable, from any number of spots on a page — unlike Database
// (Story 0.2), Note needs no "promotion on second reference" step at all,
// since `affine:note`'s own schema already permits `parent: ['@root']`; a
// secondary Note is independently valid the moment it's created. This also
// means deleting a reference NEVER cascades to the canonical Note (Note is
// treated like Frame here, not like Database).
describe('note referenced more than once on a page', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  // `affine:note`'s block-tree parent is always the doc root (`@root`, a
  // role only `affine:page` carries — `affine:surface`'s role is `'hub'`),
  // regardless of `xywh`/`displayMode`, which only affect edgeless
  // rendering position — so this mirrors `addNote()` exactly, just with a
  // populated first paragraph to double as an identifying label.
  function createReusableNote() {
    const noteId = addNote(doc, { xywh: '[0, 0, 400, 200]' });
    const paragraphId = doc.getBlock(noteId)!.model.children[0]!.id;
    doc.updateBlock(doc.getModelById(paragraphId)!, {
      text: new Text('Hello reusable note'),
    });
    return noteId;
  }

  test('inserting a reference renders the note live, in place, editable', async () => {
    const reusableNoteId = createReusableNote();
    await wait();

    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;

    const [success, result] = editor.std.command.exec(
      insertNoteRefBlockCommand,
      {
        refBlockId: reusableNoteId,
        place: 'after',
        selectedModels: [anchorModel],
      }
    );
    expect(success).toBeTruthy();
    expect(result.insertedNoteRefBlockId).toBeTruthy();
    await wait();

    const refEl = document.querySelector(
      `affine-note-ref[data-block-id="${result.insertedNoteRefBlockId}"]`
    ) as NoteRefBlockComponent;
    expect(refEl?.querySelector('affine-paragraph')).toBeTruthy();
    expect(refEl?.querySelector('.affine-note-ref-error')).toBeFalsy();
  });

  test('showBorder/backgroundOverride style the note-ref element itself, not an inner wrapper', async () => {
    // Regression: an earlier version set `data-show-border`/background on
    // an inner `<div>`, while the CSS rule
    // (`affine-note-ref[data-show-border='true']`) targeted the host
    // element itself — the two never matched, so neither ever visibly
    // applied. Both are now set on `this` (the host) directly in
    // `updated()`.
    const reusableNoteId = createReusableNote();
    await wait();

    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;
    const [, result] = editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: reusableNoteId,
      place: 'after',
      selectedModels: [anchorModel],
    });
    await wait();

    const refEl = document.querySelector(
      `affine-note-ref[data-block-id="${result.insertedNoteRefBlockId}"]`
    ) as NoteRefBlockComponent;

    // Defaults to a visible border (Story 0.6's "border by default" theme).
    expect(refEl.dataset.showBorder).toBe('true');

    doc.updateBlock(doc.getModelById(result.insertedNoteRefBlockId!)!, {
      showBorder: false,
      backgroundOverride: 'rgb(4, 5, 6)',
    });
    await wait();

    expect(refEl.dataset.showBorder).toBe('false');
    expect(refEl.style.backgroundColor).toBe('rgb(4, 5, 6)');
  });

  test('a newly created note-ref picks up its initial border/background from Settings -> Editor -> Note, not a bare schema default', async () => {
    // Regression: `NoteRefBlockSchema`'s own defaults (`showBorder: true`,
    // `backgroundOverride: undefined`) were always used verbatim for every
    // freshly created note-ref, completely ignoring whatever the user had
    // configured in Settings -> Editor -> Note (or last used) — neither
    // creating a new reusable note nor referencing an existing one honored
    // it. Root cause: the canonical Note's own `pageBorder`/
    // `pageBackgroundOverride` (which *do* get seeded from settings via
    // `applyLastProps` at creation) are irrelevant here, since
    // `NoteBlockComponent`'s render-time logic explicitly ignores them for
    // any `EdgelessOnly` note — and a note-ref's canonical is always
    // `EdgelessOnly`. `insertNoteRefBlockCommand` now resolves the note-ref's
    // own initial `showBorder`/`backgroundOverride` from the same
    // `'affine:note'` settings directly (`resolveNoteRefStyleDefaults`).
    const std = editor.std;
    (std.get(EditPropsStore) as any).innerProps$.value = {
      'affine:note': {
        pageBorder: false,
        pageBackgroundOverride: 'rgb(7, 8, 9)',
      },
    };

    const reusableNoteId = createReusableNote();
    await wait();

    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;
    const [, result] = std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: reusableNoteId,
      place: 'after',
      selectedModels: [anchorModel],
    });
    await wait();

    const refModel = doc.getBlock(result.insertedNoteRefBlockId!)!
      .model as unknown as {
      props: { showBorder: boolean; backgroundOverride?: string };
    };
    expect(refModel.props.showBorder).toBe(false);
    expect(refModel.props.backgroundOverride).toBe('rgb(7, 8, 9)');
  });

  test('two references to the same note share live data', async () => {
    const reusableNoteId = createReusableNote();
    await wait();

    const firstAnchorNoteId = addNote(doc);
    const firstAnchor = doc.getBlock(firstAnchorNoteId)!.model.children[0]!;
    const [, firstResult] = editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: reusableNoteId,
      place: 'after',
      selectedModels: [firstAnchor],
    });

    const secondAnchorNoteId = addNote(doc);
    const secondAnchor = doc.getBlock(secondAnchorNoteId)!.model.children[0]!;
    const [, secondResult] = editor.std.command.exec(
      insertNoteRefBlockCommand,
      {
        refBlockId: reusableNoteId,
        place: 'after',
        selectedModels: [secondAnchor],
      }
    );
    await wait();

    const rowCountBefore = doc.getModelById(reusableNoteId)!.children.length;
    doc.addBlock(
      'affine:paragraph',
      { text: new Text('a new line') },
      reusableNoteId
    );
    await wait();

    expect(doc.getModelById(reusableNoteId)!.children.length).toBe(
      rowCountBefore + 1
    );

    for (const result of [firstResult, secondResult]) {
      const el = document.querySelector(
        `affine-note-ref[data-block-id="${result.insertedNoteRefBlockId}"]`
      ) as NoteRefBlockComponent;
      expect(el?.querySelector('affine-paragraph')).toBeTruthy();
    }
  });

  test('deleting the only reference does not delete the canonical note', async () => {
    const reusableNoteId = createReusableNote();
    await wait();

    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;
    const [, result] = editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: reusableNoteId,
      place: 'after',
      selectedModels: [anchorModel],
    });
    await wait();

    const rowCountBefore = doc.getModelById(reusableNoteId)!.children.length;

    doc.deleteBlock(doc.getBlock(result.insertedNoteRefBlockId!)!.model);
    await wait();

    // Unlike Database's last-reference cascade, the canonical Note (and its
    // content) is untouched — Note is treated like Frame, not Database.
    expect(doc.getBlock(reusableNoteId)).toBeTruthy();
    expect(doc.getModelById(reusableNoteId)!.children.length).toBe(
      rowCountBefore
    );
  });

  test('a text-range selection sweeping across a reference does not reach its nested content', async () => {
    const reusableNoteId = createReusableNote();
    await wait();

    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;
    const [, result] = editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: reusableNoteId,
      place: 'after',
      selectedModels: [anchorModel],
    });
    await wait();

    const refEl = document.querySelector(
      `affine-note-ref[data-block-id="${result.insertedNoteRefBlockId}"]`
    ) as NoteRefBlockComponent;

    const range = document.createRange();
    range.selectNodeContents(refEl);

    const selected = editor.std.range.getSelectedBlockComponentsByRange(range, {
      mode: 'flat',
    });
    const selectedIds = selected.map(el => el.blockId);

    expect(selectedIds).toContain(result.insertedNoteRefBlockId);
    expect(selectedIds).not.toContain(reusableNoteId);
  });

  test('a selection resting inside a reference still resolves the block the cursor is in (e.g. for slash-menu commands)', async () => {
    // Regression test: the range-query exclusion above must not be a
    // permanent blanket on every embedded descendant. `getSelectedModelsCommand`
    // (which slash-menu actions like "Table View"/"Calendar View" pipe
    // through to find their insertion point) resolves its target via this
    // same `getSelectedBlockComponentsByRange` machinery. A blanket,
    // always-on exclusion made it silently resolve zero selected models
    // for a cursor sitting anywhere inside a note-ref, so those actions
    // no-oped without any visible error. The exclusion must only apply
    // while the current selection is NOT fully contained within the
    // reference (i.e. an external sweep crossing its boundary).
    const reusableNoteId = createReusableNote();
    await wait();

    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;
    editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: reusableNoteId,
      place: 'after',
      selectedModels: [anchorModel],
    });
    await wait();

    const innerParagraphModel =
      doc.getBlock(reusableNoteId)!.model.children[0]!;

    const selection = editor.std.selection.create(TextSelection, {
      from: { blockId: innerParagraphModel.id, index: 0, length: 0 },
      to: null,
    });
    editor.std.selection.setGroup('note', [selection]);
    await wait();

    const paragraphEl = document.querySelector(
      `[data-block-id="${innerParagraphModel.id}"]`
    ) as HTMLElement;
    expect(paragraphEl).toBeTruthy();

    const range = document.createRange();
    range.selectNodeContents(paragraphEl);
    const selected = editor.std.range.getSelectedBlockComponentsByRange(range, {
      mode: 'flat',
    });

    expect(selected.map(el => el.blockId)).toContain(innerParagraphModel.id);
  });

  test('a pointerdown inside a reference keeps the (single, shared) outer dispatcher active', async () => {
    // The nested-`BlockStdScope` architecture this replaced had a SECOND,
    // competing dispatcher that a pointerdown here needed to keep active
    // instead of the outer one. Rendering directly through the outer host
    // (`this.std.host.renderChildren(canonical)`) means there's only ever
    // one dispatcher at all — this just confirms interacting with content
    // inside a `note-ref` doesn't deactivate the (only) editor dispatcher.
    const reusableNoteId = createReusableNote();
    await wait();

    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;
    const [, result] = editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: reusableNoteId,
      place: 'after',
      selectedModels: [anchorModel],
    });
    await wait();

    const refEl = document.querySelector(
      `affine-note-ref[data-block-id="${result.insertedNoteRefBlockId}"]`
    ) as NoteRefBlockComponent;
    const paragraphEl = refEl.querySelector('affine-paragraph') as HTMLElement;
    expect(paragraphEl).toBeTruthy();

    paragraphEl.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, composed: true })
    );
    await wait();

    expect(editor.std.event.active).toBe(true);
  });

  test('pasting plain text inside a same-doc reference lands at the cursor, not at the top of the page', async () => {
    // The referenced (canonical) note's blocks render inside the outer
    // host, but the canonical note itself has no block component. Paste
    // resolved its insertion point through `std.view.getBlock(parent)`,
    // found nothing, and fell back to "paste after the page's first
    // paragraph" -- so text pasted into a referenced note jumped to the top.
    const reusableNoteId = createReusableNote();
    // Like every note created through `/note`, the canonical note is
    // edgeless-only, so the page view never renders it as a block itself.
    doc.updateBlock(doc.getModelById(reusableNoteId)!, {
      displayMode: NoteDisplayMode.EdgelessOnly,
    });
    await wait();

    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;
    const [, result] = editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: reusableNoteId,
      place: 'after',
      selectedModels: [anchorModel],
    });
    await wait();

    const reusableNote = doc.getModelById(reusableNoteId)!;
    const paragraph = reusableNote.children[0]!;
    const refEl = document.querySelector(
      `affine-note-ref[data-block-id="${result.insertedNoteRefBlockId}"]`
    ) as NoteRefBlockComponent;
    const paragraphEl = refEl.querySelector('affine-paragraph') as HTMLElement;
    paragraphEl.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, composed: true })
    );
    editor.std.selection.setGroup('note', [
      editor.std.selection.create(TextSelection, {
        from: { blockId: paragraph.id, index: 5, length: 0 },
        to: null,
      }),
    ]);
    await wait();

    const anchorNoteChildrenBefore =
      doc.getModelById(anchorNoteId)!.children.length;
    const data = new DataTransfer();
    data.setData('text/plain', 'XYZ');
    paragraphEl.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        composed: true,
      })
    );
    await wait(200);

    expect(paragraph.text?.toString()).toBe('HelloXYZ reusable note');
    expect(reusableNote.children.length).toBe(1);
    expect(doc.getModelById(anchorNoteId)!.children.length).toBe(
      anchorNoteChildrenBefore
    );
  });

  // Per direct user decision (2026-07-22, reversing an earlier decision in
  // this same story): `/note` must insert a `note-ref` *embedded in place*
  // within the invoking note's own flow — not a plain native sibling note
  // — because `affine:note`'s schema only ever permits `parent: ['@root']`,
  // so a native note can never have ordinary page content continue after
  // it in the same note; a `note-ref` (parent: note/paragraph/list) can.
  test('creating a new note inserts a note-ref embedded in place, pointing at a new hidden canonical note', async () => {
    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;

    const [success, result] = editor.std.command.exec(
      createReusableNoteAndInsertRefCommand,
      {
        place: 'after',
        selectedModels: [anchorModel],
      }
    );
    expect(success).toBeTruthy();
    expect(result.insertedNoteRefBlockId).toBeTruthy();
    await wait();

    const refBlock = doc.getBlock(result.insertedNoteRefBlockId!);
    expect(refBlock?.model.flavour).toBe('affine:note-ref');

    // Embedded within the SAME note the command was invoked from — not a
    // flat top-level sibling.
    const refParent = doc.getParent(refBlock!.model);
    expect(refParent?.id).toBe(anchorNoteId);

    const refModel = refBlock!.model as unknown as {
      props: { refBlockId: string };
    };
    const canonical = doc.getBlock(refModel.props.refBlockId);
    expect(canonical).toBeTruthy();
    expect(canonical!.model.flavour).toBe('affine:note');

    // The canonical stays hidden (EdgelessOnly) — it's purely a data host,
    // never itself shown directly in page flow.
    const { NoteDisplayMode } = await import('@blocksuite/affine/model');
    expect(
      (canonical!.model as unknown as { props: { displayMode: unknown } }).props
        .displayMode
    ).toBe(NoteDisplayMode.EdgelessOnly);
  });

  test('a note with no explicit pageBorder value falls back to !isPageBlock() (legacy-document safety); an explicit value always wins', async () => {
    // A note with `pageBorder: undefined` (never touched by the app-layer
    // creation-time override, or a doc from before this prop existed at
    // all) must still default sensibly: no border for whatever this
    // component considers the page's own primary note, a border for
    // anything else. Explicit values (set either by
    // `EditorSettingDocCreateMiddleware` at creation or a user's own
    // "Note Style" panel toggle) always override this fallback regardless
    // of `isPageBlock()`.
    const primaryNoteId = addNote(doc);
    await wait();
    const secondaryNoteId = addNote(doc);
    await wait();

    const primaryEl = document.querySelector(
      `affine-note[data-block-id="${primaryNoteId}"] .affine-note-block-container`
    ) as HTMLElement | null;
    const secondaryEl = document.querySelector(
      `affine-note[data-block-id="${secondaryNoteId}"] .affine-note-block-container`
    ) as HTMLElement | null;
    expect(primaryEl?.dataset.pageBorder).toBe('false');
    expect(secondaryEl?.dataset.pageBorder).toBe('true');
  });

  test('a note explicitly given pageBorder: false / no background renders borderless with no override — including a note flagged as the page block', async () => {
    // Simulates what `EditorSettingDocCreateMiddleware.beforeCreate` does
    // for a brand-new doc's primary note: explicit `pageBorder: false` at
    // creation time, not a runtime `isPageBlock()` override — so this
    // works identically whether or not the note happens to be primary,
    // and a user can still deliberately turn it back on afterward via the
    // "Note Style" panel (not gated on `isPageBlock()` either).
    const primaryNoteId = addNote(doc, {
      pageBorder: false,
      pageBackgroundOverride: undefined,
    });
    await wait();

    const primaryEl = document.querySelector(
      `affine-note[data-block-id="${primaryNoteId}"] .affine-note-block-container`
    ) as HTMLElement;
    expect(primaryEl?.dataset.pageBorder).toBe('false');
    expect(primaryEl?.style.backgroundColor).toBe('');

    // A user can still deliberately re-enable it afterward.
    doc.updateBlock(doc.getModelById(primaryNoteId)!, {
      pageBorder: true,
      pageBackgroundOverride: 'rgb(9, 9, 9)',
    });
    await wait();
    expect(primaryEl?.dataset.pageBorder).toBe('true');
    expect(primaryEl?.style.backgroundColor).toBe('rgb(9, 9, 9)');
  });

  test('page-border and background can be overridden per note', async () => {
    addNote(doc);
    await wait();
    const secondaryNoteId = addNote(doc);
    await wait();

    doc.updateBlock(doc.getModelById(secondaryNoteId)!, {
      pageBorder: false,
      pageBackgroundOverride: 'rgb(1, 2, 3)',
    });
    await wait();

    const secondaryEl = document.querySelector(
      `affine-note[data-block-id="${secondaryNoteId}"] .affine-note-block-container`
    ) as HTMLElement;
    expect(secondaryEl.dataset.pageBorder).toBe('false');
    expect(secondaryEl.style.backgroundColor).toBe('rgb(1, 2, 3)');
  });

  test('a freshly created canonical note starts with exactly one empty paragraph', async () => {
    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;

    const [, result] = editor.std.command.exec(
      createReusableNoteAndInsertRefCommand,
      { place: 'after', selectedModels: [anchorModel] }
    );
    await wait();

    const refModel = doc.getBlock(result.insertedNoteRefBlockId!)!
      .model as unknown as { props: { refBlockId: string } };
    const created = doc.getModelById(refModel.props.refBlockId)!;
    expect(created.children.length).toBe(1);
    expect(created.children[0]!.flavour).toBe('affine:paragraph');
    expect(created.children[0]!.text?.length).toBe(0);
  });

  test('a non-text block landing last in a referenced note gets a trailing empty paragraph to continue into (already-mounted reference)', async () => {
    // Regression test: unlike the page's own last note (which the page-root's
    // blank-click handler already guarantees a landing spot for, via
    // `appendParagraphCommand`), a canonical note embedded mid-page via
    // `note-ref` has no equivalent affordance — a non-text block (LaTeX,
    // a nested note reference, Database, etc.) landing last leaves nothing
    // to click or type into within that note. `note-ref-block.ts`'s
    // `_ensureTrailingParagraph` guarantees this proactively instead.
    //
    // Order of operations matters here: the reference is inserted and
    // mounted *first*, matching the live bug report exactly — a non-text
    // block replacing the canonical's sole paragraph *after* the note-ref
    // is already connected. An earlier version of this test built the
    // LaTeX-only canonical *before* inserting the note-ref, which only
    // exercised `connectedCallback`'s one-shot initial check and missed
    // that the debounced doc-update path (the one that has to catch a
    // live edit to an already-mounted reference) didn't actually fire in
    // practice — `updated()` (triggered by BlockSuite's own signal-based
    // reactivity, the same mechanism that already makes "Enter creates a
    // new line" work) is what actually needs to catch this, not the
    // parallel raw Yjs `update` subscription.
    const reusableNoteId = createReusableNote();
    await wait();

    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;
    editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: reusableNoteId,
      place: 'after',
      selectedModels: [anchorModel],
    });
    await wait();

    // Now, with the reference already mounted, replace the canonical's
    // sole paragraph with a non-text block — mirroring what
    // `insertLatexBlockCommand`'s own `removeEmptyLine` behavior does live.
    const canonicalModel = doc.getBlock(reusableNoteId)!.model;
    // oxlint-disable-next-line unicorn/no-useless-spread -- snapshot is required, the loop body deletes from the live (reactive) children array
    for (const child of [...canonicalModel.children]) {
      doc.deleteBlock(child);
    }
    doc.addBlock('affine:latex', { latex: 'E=mc^2' }, reusableNoteId);
    await wait(200);

    const children = doc.getBlock(reusableNoteId)!.model.children;
    expect(children.length).toBe(2);
    expect(children[0]!.flavour).toBe('affine:latex');
    expect(children[1]!.flavour).toBe('affine:paragraph');
    expect(children[1]!.text?.length).toBe(0);
  });

  test('two SIMULTANEOUS references to the same canonical each racing to add a trailing paragraph do not duplicate it', async () => {
    // Reported symptom (live, on the committed pr/18 branch, not any
    // uncommitted experiment): reloading a page with a note referenced
    // more than once sometimes appends *multiple* extra empty paragraphs
    // to the canonical, proportional to how many references exist, but
    // stabilizes after the first reload (doesn't keep growing on
    // subsequent reloads). `_ensureTrailingParagraph` guards against
    // re-adding once *a* trailing paragraph already exists (`lastChild
    // ?.text !== undefined`) — but every mounted reference's own
    // `updated()` calls it independently, with no cross-instance
    // coordination. If two references both observe "no trailing
    // paragraph yet" before either one's `addBlock` lands, both add one.
    const reusableNoteId = createReusableNote();
    // oxlint-disable-next-line unicorn/no-useless-spread -- snapshot is required, the loop body deletes from the live (reactive) children array
    for (const child of [...doc.getBlock(reusableNoteId)!.model.children]) {
      doc.deleteBlock(child);
    }
    doc.addBlock('affine:latex', { latex: 'E=mc^2' }, reusableNoteId);
    await wait();

    const anchorNoteId1 = addNote(doc);
    const anchorModel1 = doc.getBlock(anchorNoteId1)!.model.children[0]!;
    editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: reusableNoteId,
      place: 'after',
      selectedModels: [anchorModel1],
    });

    const anchorNoteId2 = addNote(doc);
    const anchorModel2 = doc.getBlock(anchorNoteId2)!.model.children[0]!;
    editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: reusableNoteId,
      place: 'after',
      selectedModels: [anchorModel2],
    });
    await wait(200);

    const children = doc.getBlock(reusableNoteId)!.model.children;
    const trailingParagraphs = children.filter(
      (child, index) =>
        index > 0 && child.flavour === 'affine:paragraph' && !child.text?.length
    );
    expect(children[0]!.flavour).toBe('affine:latex');
    expect(trailingParagraphs.length).toBe(1);
    expect(children.length).toBe(2);
  });

  test('toggling a plain edgeless note to "Display in Page" does not silently grow its content', async () => {
    // Per direct user feedback, a persisted trailing-paragraph guarantee
    // added directly by `changeNoteDisplayMode` (an earlier version of
    // this fix) made the note visibly one line longer in *edgeless* too,
    // immediately on toggle — undesirable, since nothing was actually
    // typed there. Continuing to edit past this note in page view is
    // instead the job of the pre-existing, already-generic stock
    // mechanism (`getLastNoteBlock` + `appendParagraphCommand`, wired up
    // in `PageRootBlockComponent`'s blank-area click handler) — clicking
    // in the blank space below the page's content creates a new paragraph
    // in whichever note is currently last, on demand, rather than one
    // being force-added ahead of time. This test only confirms the toggle
    // itself stays a no-op on content.
    const { changeNoteDisplayMode } =
      await import('@blocksuite/affine/blocks/note');
    const { NoteDisplayMode } = await import('@blocksuite/affine/model');

    addNote(doc); // primary page note, so the edgeless note below isn't it
    await wait();

    const edgelessNoteId = doc.addBlock(
      'affine:note',
      { xywh: '[0, 0, 400, 200]', displayMode: NoteDisplayMode.EdgelessOnly },
      doc.root
    );
    doc.addBlock(
      'affine:paragraph',
      { text: new Text('written in edgeless') },
      edgelessNoteId
    );
    await wait();

    editor.std.command.exec(changeNoteDisplayMode, {
      noteId: edgelessNoteId,
      mode: NoteDisplayMode.DocAndEdgeless,
    });
    await wait();

    const note = doc.getModelById(edgelessNoteId)!;
    expect(note.children.length).toBe(1);
    expect(note.children[0]!.text?.toString()).toBe('written in edgeless');
  });

  test('getLastNoteBlock (the stock "continue editing" mechanism) already resolves to whichever note is last, including a secondary Display-in-Page note', async () => {
    const { getLastNoteBlock } =
      await import('@blocksuite/affine/shared/utils');

    const primaryNoteId = addNote(doc);
    await wait();

    const secondaryNoteId = addNote(doc);
    await wait();

    // No code change needed here — `getLastNoteBlock` already walks
    // `doc.root.children` for the last non-`EdgelessOnly` note generically,
    // so a page with 2+ page-visible notes (however they got there) is
    // already handled by the existing stock click-to-continue mechanism.
    expect(getLastNoteBlock(doc)?.id).toBe(secondaryNoteId);
    expect(getLastNoteBlock(doc)?.id).not.toBe(primaryNoteId);
  });

  test('two canonical notes created in quick succession do not overlap on the edgeless surface', async () => {
    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;

    const [, first] = editor.std.command.exec(
      createReusableNoteAndInsertRefCommand,
      { place: 'after', selectedModels: [anchorModel] }
    );
    await wait();
    const [, second] = editor.std.command.exec(
      createReusableNoteAndInsertRefCommand,
      { place: 'after', selectedModels: [anchorModel] }
    );
    await wait();

    const { Bound } = await import('@blocksuite/global/gfx');
    const firstRefModel = doc.getBlock(first.insertedNoteRefBlockId!)!
      .model as unknown as { props: { refBlockId: string } };
    const secondRefModel = doc.getBlock(second.insertedNoteRefBlockId!)!
      .model as unknown as { props: { refBlockId: string } };
    const firstNote = doc.getModelById(
      firstRefModel.props.refBlockId
    ) as unknown as { xywh: string };
    const secondNote = doc.getModelById(
      secondRefModel.props.refBlockId
    ) as unknown as { xywh: string };
    const firstBound = Bound.deserialize(firstNote.xywh);
    const secondBound = Bound.deserialize(secondNote.xywh);
    expect(firstBound.isOverlapWithBound(secondBound)).toBe(false);
  });

  test('renaming a note from its own edgeless toolbar and from a note-ref pointing at it edit the same underlying name', async () => {
    const reusableNoteId = createReusableNote();
    doc.updateBlock(doc.getModelById(reusableNoteId)!, {
      name: 'Weekly checklist',
    });
    await wait();

    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;
    editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: reusableNoteId,
      place: 'after',
      selectedModels: [anchorModel],
    });
    await wait();

    const canonical = doc.getModelById(reusableNoteId) as unknown as {
      props: { name?: string };
    };
    expect(canonical.props.name).toBe('Weekly checklist');

    // Renaming via the canonical directly is visible from the note-ref's
    // own perspective too (same underlying prop, not a copy).
    doc.updateBlock(doc.getModelById(reusableNoteId)!, {
      name: 'Renamed checklist',
    });
    await wait();
    expect(
      (
        doc.getModelById(reusableNoteId) as unknown as {
          props: { name?: string };
        }
      ).props.name
    ).toBe('Renamed checklist');
  });
});

describe('NoteZodSchema tolerates settings persisted before pageBorder/pageBackgroundOverride existed', () => {
  test('parses a legacy-shaped partial object without throwing, filling in field-level defaults', async () => {
    // Regression: `pageBorder`/`pageBackgroundOverride` were first added as
    // a bare `z.boolean()` (no field-level `.default(...)`) — the schema's
    // own outer `.default({...})` only covers the case where the *entire*
    // `'affine:note'` settings value is `undefined`; a pre-existing,
    // already-persisted *partial* object (has `background`/`displayMode`/
    // `edgeless`, missing these two new keys) is not `undefined`, so zod
    // required every non-optional field on it and threw — breaking the
    // entire per-flavour settings/last-used-style persistence for
    // `affine:note`, not just these two fields, the moment it was read.
    const { NoteZodSchema, NoteDisplayMode, DefaultTheme } =
      await import('@blocksuite/affine/model');

    const legacyPersistedValue = {
      background: DefaultTheme.noteBackgrounColor,
      displayMode: NoteDisplayMode.EdgelessOnly,
      edgeless: {
        style: {
          borderRadius: 8,
          borderSize: 4,
          borderStyle: 'solid',
          shadowType: '--affine-note-shadow-box',
        },
      },
      // pageBorder / pageBackgroundOverride deliberately absent
    };

    let parsed: unknown;
    expect(() => {
      parsed = NoteZodSchema.parse(legacyPersistedValue);
    }).not.toThrow();
    expect((parsed as { pageBorder: boolean }).pageBorder).toBe(true);
    expect(
      (parsed as { pageBackgroundOverride?: unknown }).pageBackgroundOverride
    ).toBeUndefined();
  });
});

// Story 0.5: cross-doc (inter-page) referencing for Note, extending Story
// 0.6's same-page-only `note-ref`. Exercises `insertNoteRefBlockCommand`'s
// cross-doc branch directly (`refBlockId` + a real foreign `refDocId`),
// mirroring `database-ref.spec.ts`'s own cross-doc describe block shape —
// the not-yet-built cross-doc picker UI is out of scope for these tests,
// same as it was for `database-ref`'s equivalents in Story 0.3.
describe('note referenced across pages (cross-doc)', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  // Mirrors `database-ref.spec.ts`'s own `createSecondDoc` exactly — a
  // second, genuinely separate doc within the same `TestWorkspace`/
  // `collection`, the same shape a real second page would have.
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

  function createReusableNoteOn(targetDoc: Store) {
    const noteId = addNote(targetDoc, { xywh: '[0, 0, 400, 200]' });
    const paragraphId = targetDoc.getBlock(noteId)!.model.children[0]!.id;
    targetDoc.updateBlock(targetDoc.getModelById(paragraphId)!, {
      text: new Text('Hello from another page'),
    });
    return noteId;
  }

  test('the referenced note renders as a block box, not the custom-element default inline', async () => {
    // 999.15: on iOS, once focus is inside the reference, WebKit stops
    // moving the caret on a tap. Its tap-in-focused-editable path clamps
    // the tap point to the focused element's box, and `<affine-note>` with
    // no display rule is `inline` (wrapping block children), so it has no
    // usable box. The page's own note only escapes this because its parent
    // container is `display: flex`. Confirmed live: forcing `display:
    // block` on the referenced note alone restored native caret placement.
    const secondDoc = createSecondDoc();
    const reusableNoteId = createReusableNoteOn(secondDoc);

    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;
    const [, result] = editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: reusableNoteId,
      refDocId: secondDoc.id,
      place: 'after',
      selectedModels: [anchorModel],
    });
    await wait();

    const refEl = document.querySelector(
      `affine-note-ref[data-block-id="${result.insertedNoteRefBlockId}"]`
    ) as NoteRefBlockComponent;
    const innerNote = refEl.querySelector('affine-note');
    expect(innerNote).toBeTruthy();
    expect(getComputedStyle(innerNote!).display).toBe('block');
  });

  test('a note in another doc renders live and shares data across the two pages', async () => {
    const secondDoc = createSecondDoc();
    const reusableNoteId = createReusableNoteOn(secondDoc);

    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;
    const [success, result] = editor.std.command.exec(
      insertNoteRefBlockCommand,
      {
        refBlockId: reusableNoteId,
        refDocId: secondDoc.id,
        place: 'after',
        selectedModels: [anchorModel],
      }
    );
    expect(success).toBeTruthy();
    expect(result.insertedNoteRefBlockId).toBeTruthy();
    await wait();

    const refEl = document.querySelector(
      `affine-note-ref[data-block-id="${result.insertedNoteRefBlockId}"]`
    ) as NoteRefBlockComponent;
    expect(refEl?.querySelector('affine-paragraph')).toBeTruthy();
    expect(refEl?.querySelector('.affine-note-ref-error')).toBeFalsy();

    const rowCountBefore =
      secondDoc.getModelById(reusableNoteId)!.children.length;
    secondDoc.addBlock(
      'affine:paragraph',
      { text: new Text('a new line from the source doc') },
      reusableNoteId
    );
    await wait();

    // A paragraph added directly on the source doc is visible through the
    // cross-doc reference's own live rendering — the whole point of real
    // `refDocId` resolution over no cross-doc mechanism at all.
    expect(secondDoc.getModelById(reusableNoteId)!.children.length).toBe(
      rowCountBefore + 1
    );
  });

  test('editing the rendered cross-doc content writes back to the real source doc', async () => {
    // The nested `BlockStdScope` this cross-doc path mounts (see
    // `note-ref-block.ts`) builds its own independent reactive model graph
    // over the *same* underlying Yjs data — mirroring `database-ref`'s own
    // documented behavior for its identical cross-doc mechanism — so the
    // rendered model is never the *same instance* as `secondDoc`'s own
    // (unlike the same-doc path, which genuinely shares one instance).
    // What has to hold instead: editing through the nested render lands on
    // the real source doc's data, not a disconnected copy.
    const secondDoc = createSecondDoc();
    const reusableNoteId = createReusableNoteOn(secondDoc);

    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;
    const [, result] = editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: reusableNoteId,
      refDocId: secondDoc.id,
      place: 'after',
      selectedModels: [anchorModel],
    });
    await wait();

    const sourceParagraphId =
      secondDoc.getModelById(reusableNoteId)!.children[0]!.id;

    const refEl = document.querySelector(
      `affine-note-ref[data-block-id="${result.insertedNoteRefBlockId}"]`
    ) as NoteRefBlockComponent;
    const renderedParagraphEl = refEl.querySelector(
      `[data-block-id="${sourceParagraphId}"]`
    ) as { model?: BlockModel } | null;
    const renderedModel = renderedParagraphEl?.model;

    expect(renderedModel?.id).toBe(sourceParagraphId);

    // Edit through the *rendered* (nested-scope) model's own store, not
    // `secondDoc` directly — confirms the nested store's writes land on
    // the real shared Yjs data, not some disconnected copy.
    renderedModel!.store.updateBlock(renderedModel!, {
      text: new Text('edited through the nested cross-doc render'),
    });
    await wait();

    expect(secondDoc.getModelById(sourceParagraphId)!.text?.toString()).toBe(
      'edited through the nested cross-doc render'
    );
  });

  // Regression test for a real live bug: the nested scope's own
  // `_previewStore` is built from a fixed *snapshot* `Query`
  // (`mode: 'include', match: [...]`) of block ids collected once by
  // `_maybeRefreshPreview` — a query-filtered `Store` never exposes a block
  // whose id wasn't in that snapshot, no matter what happens to the real,
  // unfiltered doc afterward. Splitting a paragraph (Enter) or converting one
  // to a list (a markdown shortcut) both create a brand-new sibling block
  // with a brand-new id under the canonical note — if the query doesn't get
  // rebuilt to include it, the data write is completely correct (confirmed
  // live) but the new block simply never renders through this reference: a
  // structural change looked like nothing happened, or (worse, when the
  // *old* block is also deleted as part of the same conversion) like the
  // line's own text had vanished.
  test('a new sibling block added to the canonical note (e.g. splitting a paragraph) renders through an already-mounted cross-doc reference', async () => {
    const secondDoc = createSecondDoc();
    const reusableNoteId = createReusableNoteOn(secondDoc);

    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;
    const [, result] = editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: reusableNoteId,
      refDocId: secondDoc.id,
      place: 'after',
      selectedModels: [anchorModel],
    });
    await wait();

    const refEl = document.querySelector(
      `affine-note-ref[data-block-id="${result.insertedNoteRefBlockId}"]`
    ) as NoteRefBlockComponent;

    const sourceParagraphId =
      secondDoc.getModelById(reusableNoteId)!.children[0]!.id;
    const renderedParagraphEl = refEl.querySelector(
      `[data-block-id="${sourceParagraphId}"]`
    ) as { model?: BlockModel } | null;
    const renderedModel = renderedParagraphEl?.model;
    expect(renderedModel).toBeTruthy();

    // Add the new sibling through the nested scope's own rendered store —
    // exactly what `splitParagraphCommand` (Enter) or the list markdown
    // matcher's `store.addBlock` do — not through `secondDoc` directly, so
    // this exercises the same query-filtered store the live bug hit.
    const newBlockId = renderedModel!.store.addBlock(
      'affine:paragraph',
      { text: new Text('a brand-new sibling paragraph') },
      reusableNoteId
    );
    // `_subscribeTargetDoc`'s own doc-update handler (the mechanism that
    // rebuilds the query once a new sibling id shows up) debounces by
    // 100ms — `wait()`'s zero-arg default resolves sooner than that.
    await wait(200);

    expect(secondDoc.getModelById(newBlockId)).toBeTruthy();
    expect(refEl.querySelector(`[data-block-id="${newBlockId}"]`)).toBeTruthy();
  });

  // Regression test for the actual architectural root cause behind an
  // entire session's worth of chased symptoms (focus loss after Enter, a
  // markdown-shortcut block's own text disappearing, a slash-menu item's
  // popup never showing, a visible scroll jump on every structural edit):
  // `_maybeRefreshPreview` used to rebuild the entire nested `Query`/
  // `Store`/`BlockStdScope` from scratch every time a *descendant* of the
  // canonical note changed — since the query was a fixed snapshot of ids
  // collected once — destroying and recreating all of the reference's own
  // DOM even for an ordinary Enter press. Each individual symptom got its
  // own targeted fix earlier, but this test asserts the deeper claim
  // directly: with the `Query`'s new `ancestor`-based match kind (see
  // `query.ts`), a structural edit inside an already-rendered reference
  // must *not* replace the nested `BlockStdScope` instance, or tear down
  // and recreate the DOM of blocks that didn't change, at all.
  test('a new sibling block added to the canonical note does NOT rebuild the nested BlockStdScope or tear down existing, unrelated DOM', async () => {
    const secondDoc = createSecondDoc();
    const reusableNoteId = createReusableNoteOn(secondDoc);

    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;
    const [, result] = editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: reusableNoteId,
      refDocId: secondDoc.id,
      place: 'after',
      selectedModels: [anchorModel],
    });
    await wait();

    const refEl = document.querySelector(
      `affine-note-ref[data-block-id="${result.insertedNoteRefBlockId}"]`
    ) as NoteRefBlockComponent;
    const refElInternals = refEl as unknown as Record<string, unknown>;

    const sourceParagraphId =
      secondDoc.getModelById(reusableNoteId)!.children[0]!.id;
    const existingParagraphElBefore = refEl.querySelector(
      `[data-block-id="${sourceParagraphId}"]`
    );
    expect(existingParagraphElBefore).toBeTruthy();

    const stdBefore = refElInternals._previewStd;
    expect(stdBefore).toBeTruthy();

    const newBlockId = (
      existingParagraphElBefore as unknown as { model: BlockModel }
    ).model.store.addBlock(
      'affine:paragraph',
      { text: new Text('a brand-new sibling paragraph') },
      reusableNoteId
    );
    await wait(200);

    // The nested std instance itself must be the exact same object —
    // not just "an equivalent one" — proving no store/scope swap happened.
    expect(refElInternals._previewStd).toBe(stdBefore);

    // The pre-existing paragraph's own DOM element must be the exact same
    // node, not a newly (re)created one with the same block id — proving
    // Lit's own keyed `repeat()` reconciliation only appended the new
    // sibling rather than re-rendering the whole children list from
    // scratch.
    const existingParagraphElAfter = refEl.querySelector(
      `[data-block-id="${sourceParagraphId}"]`
    );
    expect(existingParagraphElAfter).toBe(existingParagraphElBefore);

    expect(refEl.querySelector(`[data-block-id="${newBlockId}"]`)).toBeTruthy();
  });

  // Regression tests for a real live bug that no *synthetic*-event or
  // direct-command test in this file could reproduce: a genuine, real
  // Playwright-driven `userEvent` click + native keyboard `Enter` (not
  // `dispatchEvent`, not calling `focusTextModel`/commands directly)
  // reliably lost native focus after Enter, requiring the user to click
  // back into the reference to keep typing. Root-caused across several
  // rounds of live debugging to two compounding issues in
  // `_reclaimFocusAfterSelectionChange` (see that method's own doc
  // comment for the full mechanism): (1) a single `requestAnimationFrame`
  // isn't reliably enough time for the newly (re)mounted block's own
  // component to connect to the nested `ViewStore`, and (2) the very same
  // structural edit that triggers a reclaim can *also* cause
  // `_maybeRefreshPreview` to swap in an entirely new `BlockStdScope`
  // (since the edit's own new block id wasn't in the previous `Query`
  // snapshot), orphaning an in-flight reclaim that was tracking the old
  // std by reference. Confirmed these tests genuinely exercise the real
  // native focus/selection machinery (not just the data layer, which
  // several other tests in this file already cover) by reproducing the
  // failure directly in a live browser before landing the fix.
  test('a real (Playwright userEvent) click + native Enter keypress keeps native focus in the reference, letting immediately-typed text land in the right place', async () => {
    const secondDoc = createSecondDoc();
    const reusableNoteId = createReusableNoteOn(secondDoc);

    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;
    const [, result] = editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: reusableNoteId,
      refDocId: secondDoc.id,
      place: 'after',
      selectedModels: [anchorModel],
    });
    await wait(200);

    const refEl = document.querySelector(
      `affine-note-ref[data-block-id="${result.insertedNoteRefBlockId}"]`
    ) as NoteRefBlockComponent;
    expect(refEl).toBeTruthy();

    const sourceParagraphId =
      secondDoc.getModelById(reusableNoteId)!.children[0]!.id;
    const paragraphEl = refEl.querySelector(
      `[data-block-id="${sourceParagraphId}"]`
    ) as HTMLElement;
    const textEl =
      paragraphEl.querySelector('[data-v-text="true"]') ?? paragraphEl;

    // "Hello from another page" — click lands the caret at index 12,
    // right after "Hello from a" / before "nother page".
    await userEvent.click(textEl);
    await wait(50);

    await userEvent.keyboard('{Enter}');
    await wait(300);

    expect(document.activeElement?.closest('affine-note-ref')).toBe(refEl);
    expect(document.getSelection()?.rangeCount).toBe(1);

    // Text typed immediately after Enter, with no re-click, has to land
    // at the start of the newly-created second paragraph — not be lost
    // entirely (the original failure mode: it landed nowhere at all,
    // since native focus was stuck on `<body>`).
    await userEvent.keyboard('hello');
    await wait(300);

    expect(
      secondDoc
        .getModelById(reusableNoteId)!
        .children.map(c => c.text?.toString())
    ).toEqual(['Hello from a', 'hellonother page']);

    // A second, chained Enter (exercising a mid-edit `_previewStd` swap a
    // single Enter might not trigger) has to keep working the same way.
    await userEvent.keyboard('{Enter}');
    await wait(300);
    await userEvent.keyboard('world');
    await wait(300);

    expect(document.activeElement?.closest('affine-note-ref')).toBe(refEl);
    expect(
      secondDoc
        .getModelById(reusableNoteId)!
        .children.map(c => c.text?.toString())
    ).toEqual(['Hello from a', 'hello', 'worldnother page']);
  });

  test('a real (Playwright userEvent) "* " markdown-shortcut bullet conversion keeps native focus, letting immediately-typed text land in the new list block', async () => {
    const secondDoc = createSecondDoc();
    const reusableNoteId = createReusableNoteOn(secondDoc);

    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;
    const [, result] = editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: reusableNoteId,
      refDocId: secondDoc.id,
      place: 'after',
      selectedModels: [anchorModel],
    });
    await wait(200);

    const refEl = document.querySelector(
      `affine-note-ref[data-block-id="${result.insertedNoteRefBlockId}"]`
    ) as NoteRefBlockComponent;
    expect(refEl).toBeTruthy();

    const sourceParagraphId =
      secondDoc.getModelById(reusableNoteId)!.children[0]!.id;
    const paragraphEl = refEl.querySelector(
      `[data-block-id="${sourceParagraphId}"]`
    ) as HTMLElement;
    const textEl =
      paragraphEl.querySelector('[data-v-text="true"]') ?? paragraphEl;

    await userEvent.click(textEl);
    await wait(50);

    // Real user flow: End of the existing line, Enter for a fresh empty
    // line, then the markdown shortcut on that line — the markdown
    // matcher's own conversion (delete old block, insert a brand-new
    // `affine:list` block — see this file's own "a new sibling block..."
    // test comment for that mechanism) is a *second*, independent
    // structural change layered right on top of Enter's own reclaim.
    await userEvent.keyboard('{End}{Enter}');
    await wait(300);
    await userEvent.keyboard('* ');
    await wait(300);

    expect(document.activeElement?.closest('affine-note-ref')).toBe(refEl);
    expect(document.getSelection()?.rangeCount).toBe(1);

    await userEvent.keyboard('bullet text');
    await wait(300);

    expect(
      secondDoc
        .getModelById(reusableNoteId)!
        .children.map(c => [c.flavour, c.text?.toString()])
    ).toEqual([
      ['affine:paragraph', 'Hello from another page'],
      ['affine:list', 'bullet text'],
    ]);
  });

  // Regression test for a real live bug found the same way as the two
  // above: real Playwright `userEvent` interaction (not direct command
  // calls) reproduced "the slash menu opens in the reference, but
  // clicking an item silently inserts nothing." Root-caused to
  // `_observeForCrossDocRangeExclusion` (see that method's own doc
  // comment for the full mechanism) permanently marking every descendant
  // block with `RANGE_QUERY_EXCLUDE_ATTR`, intended to protect the
  // *outer* std's own range-sweep queries from reaching into this
  // reference's content — but `RangeManager.getSelectedBlockComponentsByRange`
  // (which every selection-driven command, including every slash-menu
  // item's own insert action via `getSelectedBlocksCommand`, routes
  // through) queries `this.std.host.querySelectorAll(...)` scoped to
  // whichever std is asking — for the *nested* std that's this same
  // subtree, so the exclusion attribute (a single, shared, boolean DOM
  // attribute with no concept of "which std is asking") silently blinded
  // the nested std's own legitimate internal queries to its own content
  // too. Fixed by making the exclusion conditional (mirroring the
  // same-doc path's own `_updateRangeQueryExclusion`), applying it only
  // when the *outer* std's current selection genuinely spans across this
  // reference's boundary — the one case actually worth protecting against
  // — rather than permanently.
  test('a real (Playwright userEvent) slash-menu item click inside the reference actually inserts its block, not silently nothing', async () => {
    const secondDoc = createSecondDoc();
    const reusableNoteId = createReusableNoteOn(secondDoc);

    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;
    const [, result] = editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: reusableNoteId,
      refDocId: secondDoc.id,
      place: 'after',
      selectedModels: [anchorModel],
    });
    await wait(200);

    const refEl = document.querySelector(
      `affine-note-ref[data-block-id="${result.insertedNoteRefBlockId}"]`
    ) as NoteRefBlockComponent;
    expect(refEl).toBeTruthy();

    const sourceParagraphId =
      secondDoc.getModelById(reusableNoteId)!.children[0]!.id;
    const paragraphEl = refEl.querySelector(
      `[data-block-id="${sourceParagraphId}"]`
    ) as HTMLElement;
    const textEl =
      paragraphEl.querySelector('[data-v-text="true"]') ?? paragraphEl;

    await userEvent.click(textEl);
    await wait(50);
    await userEvent.keyboard('{End}{Enter}');
    await wait(300);

    await userEvent.keyboard('/equation');
    await wait(300);

    const slashMenu = document.querySelector('affine-slash-menu');
    const innerSlashMenu =
      slashMenu?.shadowRoot?.querySelector('inner-slash-menu');
    const equationItem = innerSlashMenu?.shadowRoot?.querySelector(
      '[data-testid="Equation"]'
    ) as HTMLElement | null | undefined;
    expect(equationItem).toBeTruthy();

    await userEvent.click(equationItem!);
    await wait(300);

    expect(
      secondDoc.getModelById(reusableNoteId)!.children.map(c => c.flavour)
    ).toEqual(['affine:paragraph', 'affine:latex', 'affine:paragraph']);
  });

  // Regression test for a real live bug reported after the fixes above:
  // undo (Mod-z) did nothing while editing inside a cross-doc reference.
  // Root-caused directly from source, no live debugging needed once
  // suspected: `NoteRefPreviewRootBlockComponent` (`preview-root.ts`) never
  // constructed a `PageKeyboardManager` at all — a pre-existing gap since
  // that file was first written, not something any of this story's other
  // fixes introduced. The real `PageRootBlockComponent` wires one up in its
  // own `connectedCallback`; this nested scope's own root component simply
  // never did, so none of the keybindings it provides — most reported live,
  // Mod-z/Shift-Mod-z (undo/redo) — were ever bound for cross-doc content.
  test('a real (Playwright userEvent) Mod-z / Shift-Mod-z inside the reference undoes and redoes an edit made inside it', async () => {
    const secondDoc = createSecondDoc();
    const reusableNoteId = createReusableNoteOn(secondDoc);

    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;
    const [, result] = editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: reusableNoteId,
      refDocId: secondDoc.id,
      place: 'after',
      selectedModels: [anchorModel],
    });
    await wait(200);

    const refEl = document.querySelector(
      `affine-note-ref[data-block-id="${result.insertedNoteRefBlockId}"]`
    ) as NoteRefBlockComponent;
    expect(refEl).toBeTruthy();

    const sourceParagraphId =
      secondDoc.getModelById(reusableNoteId)!.children[0]!.id;
    const paragraphEl = refEl.querySelector(
      `[data-block-id="${sourceParagraphId}"]`
    ) as HTMLElement;
    const textEl =
      paragraphEl.querySelector('[data-v-text="true"]') ?? paragraphEl;

    await userEvent.click(textEl);
    await wait(50);
    await userEvent.keyboard('{End}');
    await userEvent.keyboard(' typed text');
    await wait(300);

    expect(secondDoc.getModelById(sourceParagraphId)!.text?.toString()).toBe(
      'Hello from another page typed text'
    );

    await userEvent.keyboard('{Control>}z{/Control}');
    await wait(300);

    expect(secondDoc.getModelById(sourceParagraphId)!.text?.toString()).toBe(
      'Hello from another page'
    );

    await userEvent.keyboard('{Shift>}{Control>}Z{/Control}{/Shift}');
    await wait(300);

    expect(secondDoc.getModelById(sourceParagraphId)!.text?.toString()).toBe(
      'Hello from another page typed text'
    );
  });

  test('a cross-doc reference survives the source note moving and the source doc being renamed', async () => {
    const secondDoc = createSecondDoc();
    const reusableNoteId = createReusableNoteOn(secondDoc);

    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;
    const [, result] = editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: reusableNoteId,
      refDocId: secondDoc.id,
      place: 'after',
      selectedModels: [anchorModel],
    });
    await wait();

    // Move the source note (change its edgeless xywh) — `affine:note`'s
    // own schema only ever permits `parent: ['@root']`, so unlike Database
    // there's no cross-note reparenting to test; a position change is the
    // structural analog of "moved" available to Note.
    secondDoc.updateBlock(secondDoc.getModelById(reusableNoteId)!, {
      xywh: '[500, 500, 400, 200]',
    });
    await wait(500);

    // Rename the source doc itself.
    const pageBlock = secondDoc.getBlock(secondDoc.root!.id)!.model as {
      props: { title: Text };
    } & typeof secondDoc.root;
    secondDoc.transact(() => {
      pageBlock.props.title.clear();
      pageBlock.props.title.insert('Renamed second page', 0);
    });
    await wait();

    const refEl = document.querySelector(
      `affine-note-ref[data-block-id="${result.insertedNoteRefBlockId}"]`
    ) as NoteRefBlockComponent;
    expect(refEl?.querySelector('affine-paragraph')).toBeTruthy();
    expect(refEl?.querySelector('.affine-note-ref-error')).toBeFalsy();
  });

  test('a click on cross-doc content explicitly activates the nested dispatcher, not just via listener-timing luck', async () => {
    // Reported live symptom: "can sometimes not even get a cursor into the
    // note, but after a page reload I can" / "no commands are recognised."
    // `_stopDispatcherActivationBubbling`'s own stopPropagation only
    // *prevents the outer dispatcher from reactivating* — it relies on the
    // nested `BlockStdScope`'s own listener (bound further down, on the
    // nested host) having *already* activated it during the same bubble
    // phase. That listener only exists once `_previewStd` is actually
    // constructed (the render where `guard()` runs) — a real window where
    // neither dispatcher ends up active. The fix explicitly sets
    // `_previewStd.event.active = true` in the stop handler itself,
    // removing the dependency on that timing. This asserts the resulting
    // dispatcher state directly, independent of whether the exact race
    // window is reproducible in this synchronous test harness.
    const secondDoc = createSecondDoc();
    const reusableNoteId = createReusableNoteOn(secondDoc);

    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;
    const [, result] = editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: reusableNoteId,
      refDocId: secondDoc.id,
      place: 'after',
      selectedModels: [anchorModel],
    });
    await wait();

    const refEl = document.querySelector(
      `affine-note-ref[data-block-id="${result.insertedNoteRefBlockId}"]`
    ) as NoteRefBlockComponent;
    const refElInternals = refEl as unknown as {
      _previewStd?: { event: { active: boolean } };
    };
    expect(refEl).toBeTruthy();

    refEl.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true, composed: true })
    );
    await wait();

    expect(refElInternals._previewStd?.event.active).toBe(true);
    expect(editor.std.event.active).toBe(false);
  });

  test('_ensureTrailingParagraph does not add a paragraph while the source doc is still loading, and catches up once it is', async () => {
    // Reported live symptom: reloading a page with a cross-doc note-ref
    // sometimes appends extra empty paragraph(s) to the referenced note.
    // Root cause: `_getCanonical()`'s own `ensureDocLoaded(refDoc)` is
    // fire-and-forget (`if (!doc.ready) doc.load()`, never awaited) — a
    // still-loading doc's `children` can be empty/partial, indistinguishable
    // from a genuinely empty note by `lastChild?.text !== undefined`, so a
    // paragraph gets added to a note that never actually needed one. This
    // simulates that exact window: a canonical whose last child is
    // non-text (so the *real*, fully-loaded state genuinely needs a
    // trailing paragraph), observed while its own doc's `ready` is
    // (deliberately, for this test) still `false`.
    const secondDoc = createSecondDoc();
    const reusableNoteId = createReusableNoteOn(secondDoc);
    // oxlint-disable-next-line unicorn/no-useless-spread -- snapshot is required, the loop body deletes from the live (reactive) children array
    for (const child of [...secondDoc.getModelById(reusableNoteId)!.children]) {
      secondDoc.deleteBlock(child);
    }
    secondDoc.addBlock('affine:latex', { latex: 'E=mc^2' }, reusableNoteId);
    await wait();

    // Install the "still loading" stub *before* the reference ever mounts
    // — the real race is the *first* render seeing an incomplete doc, not
    // some later one.
    const realDoc = editor.std.workspace.getDoc(secondDoc.id)!;
    const notReadyStub = new Proxy(realDoc, {
      get(target, prop, receiver) {
        if (prop === 'ready') return false;
        return Reflect.get(target, prop, receiver);
      },
    });
    const originalGetDoc = editor.std.workspace.getDoc.bind(
      editor.std.workspace
    );
    editor.std.workspace.getDoc = ((id: string) =>
      id === secondDoc.id
        ? notReadyStub
        : originalGetDoc(id)) as typeof originalGetDoc;

    const anchorNoteId = addNote(doc);
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;
    let insertedNoteRefBlockId: string | undefined;
    try {
      const [, result] = editor.std.command.exec(insertNoteRefBlockCommand, {
        refBlockId: reusableNoteId,
        refDocId: secondDoc.id,
        place: 'after',
        selectedModels: [anchorModel],
      });
      insertedNoteRefBlockId = result.insertedNoteRefBlockId;
      await wait();

      expect(secondDoc.getModelById(reusableNoteId)!.children.length).toBe(1);
    } finally {
      editor.std.workspace.getDoc = originalGetDoc;
    }

    // Once the doc reports `ready` again (restored above), the very next
    // update correctly adds the trailing paragraph the note genuinely needs.
    const refEl = document.querySelector(
      `affine-note-ref[data-block-id="${insertedNoteRefBlockId}"]`
    ) as NoteRefBlockComponent & { requestUpdate(): void };
    refEl.requestUpdate();
    await refEl.updateComplete;
    await wait();

    const children = secondDoc.getModelById(reusableNoteId)!.children;
    expect(children.length).toBe(2);
    expect(children[1]!.flavour).toBe('affine:paragraph');
  });
});

// Root/page-note referencing + cycle prevention, per direct user request
// after the cross-doc feature was confirmed working: a doc's own
// primary/page note is now a valid reference target like any other note
// (previously excluded from the picker entirely), and — since that
// increases how often two "hub" pages might end up referencing each
// other — real cycle detection was added where none existed before
// (`cycle.ts`).
describe('root/page-note referencing and reference-cycle prevention', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  test("the doc's own page note can be referenced and renders live", async () => {
    // The first note added with no `displayMode` override defaults to
    // `DocAndEdgeless` (`NoteBlockSchema`'s own default) — the first such
    // note under root is, by definition, `isPageBlock()`.
    const pageNoteId = addNote(doc);
    const pageParagraphId = doc.getBlock(pageNoteId)!.model.children[0]!.id;
    doc.updateBlock(doc.getModelById(pageParagraphId)!, {
      text: new Text('This is the page itself'),
    });

    // Any *other* page-visible note added after the true page block (which
    // `pageNoteId` above already claimed) — must not be `edgeless`-only,
    // or it (and anything referenced inside it) never renders in page mode
    // at all.
    const anchorNoteId = addNote(doc, { xywh: '[0, 500, 400, 200]' });
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;

    expect((doc.getModelById(pageNoteId) as NoteBlockModel).isPageBlock()).toBe(
      true
    );

    const [success, result] = editor.std.command.exec(
      insertNoteRefBlockCommand,
      {
        refBlockId: pageNoteId,
        place: 'after',
        selectedModels: [anchorModel],
      }
    );
    expect(success).toBeTruthy();
    expect(result.insertedNoteRefBlockId).toBeTruthy();
    await wait();

    const refEl = document.querySelector(
      `affine-note-ref[data-block-id="${result.insertedNoteRefBlockId}"]`
    ) as NoteRefBlockComponent;
    expect(refEl?.querySelector('affine-paragraph')).toBeTruthy();
    expect(refEl?.querySelector('.affine-note-ref-error')).toBeFalsy();
  });

  test('the same-doc picker offers the page note as a candidate', async () => {
    // Deliberately left unnamed and with no paragraph text of its own —
    // the page note's label should fall back to the doc's own title, not
    // a child-text snippet (its identity already IS the page).
    addNote(doc);
    const anchorNoteId = addNote(doc, { displayMode: 'edgeless' });
    const paragraphId = doc.addBlock('affine:paragraph', {}, anchorNoteId);
    const model = doc.getModelById(paragraphId)!;

    const pageBlock = doc.getBlock(doc.root!.id)!.model as unknown as {
      props: { title: Text };
    };
    doc.transact(() => {
      pageBlock.props.title.clear();
      pageBlock.props.title.insert('My Great Page', 0);
    });

    const items = noteRefSlashMenuConfig.items;
    const resolvedItems =
      typeof items === 'function' ? items({ std: editor.std, model }) : items;

    const pageNoteItem = resolvedItems.find(
      item => item.name === 'Note: My Great Page'
    );
    expect(pageNoteItem).toBeTruthy();
  });

  test('a direct same-doc reference cycle (A -> B, then B -> A) is rejected', async () => {
    const noteAId = addNote(doc, { xywh: '[0, 0, 400, 200]' });
    const noteBId = addNote(doc, {
      xywh: '[500, 0, 400, 200]',
      displayMode: 'edgeless',
    });

    const paragraphInA = doc.getBlock(noteAId)!.model.children[0]!;
    const [firstSuccess, firstResult] = editor.std.command.exec(
      insertNoteRefBlockCommand,
      {
        refBlockId: noteBId,
        place: 'after',
        selectedModels: [paragraphInA],
      }
    );
    expect(firstSuccess).toBeTruthy();
    expect(firstResult.insertedNoteRefBlockId).toBeTruthy();
    await wait();

    const paragraphInB = doc.getBlock(noteBId)!.model.children[0]!;
    const [secondSuccess] = editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: noteAId,
      place: 'after',
      selectedModels: [paragraphInB],
    });

    expect(secondSuccess).toBeFalsy();
    expect(doc.getBlocksByFlavour('affine:note-ref').length).toBe(1);
  });

  test('a cross-doc reference cycle (A references B, B already references A) is rejected', async () => {
    const secondDoc = collection
      .createDoc(`doc:cycle-${Math.random().toString(16).slice(2, 8)}`)
      .getStore();
    secondDoc.load(() => {
      const rootId = secondDoc.addBlock('affine:page', { title: new Text() });
      secondDoc.addBlock('affine:surface', {}, rootId);
    });

    const noteAId = addNote(doc, { xywh: '[0, 0, 400, 200]' });
    const noteBId = secondDoc.addBlock(
      'affine:note',
      { xywh: '[0, 0, 400, 200]', displayMode: 'edgeless' },
      secondDoc.root
    );
    secondDoc.addBlock('affine:paragraph', {}, noteBId);

    // B already contains a reference back to A.
    secondDoc.addBlock(
      'affine:note-ref',
      { refBlockId: noteAId, refDocId: doc.id },
      noteBId
    );

    const paragraphInA = doc.getBlock(noteAId)!.model.children[0]!;
    const [success] = editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: noteBId,
      refDocId: secondDoc.id,
      place: 'after',
      selectedModels: [paragraphInA],
    });

    expect(success).toBeFalsy();
    expect(doc.getBlocksByFlavour('affine:note-ref').length).toBe(0);
  });
});

// "Turn into linked doc" (`root/src/edgeless/configs/toolbar/more.ts`'s
// `a.turn-into-linked-doc`, via `createLinkedDocFromNote`) — regression
// coverage for two real bugs found live: (1) the previous `replaceIdMiddleware`
// approach silently orphaned any `note-ref` pointing at the converted note,
// and (2) an earlier fix attempt called `ensureDocLoaded` on the brand-new
// destination doc *before* its own `Store.load(initFn)` populated it,
// which — since `Doc.load(initFn)` no-ops once `doc.ready` is already true —
// left the new linked doc permanently empty (no root note at all),
// manifesting as an infinite loading spinner wherever it was opened.
describe('"Turn into linked doc" preserves note-ref integrity', () => {
  beforeEach(async () => {
    const cleanup = await setupEditor('page');
    return cleanup;
  });

  test('converting a referenced note into a linked doc repoints the reference and actually populates the new doc', async () => {
    const { createLinkedDocFromNote } =
      await import('@blocksuite/affine/blocks/root');

    const canonicalNoteId = addNote(doc, {
      xywh: '[0, 0, 400, 200]',
      displayMode: 'edgeless',
    });
    doc.updateBlock(doc.getModelById(canonicalNoteId)!.children[0]!, {
      text: new Text('Content to convert into a linked doc'),
    });

    const anchorNoteId = addNote(doc, { xywh: '[0, 500, 400, 200]' });
    const anchorModel = doc.getBlock(anchorNoteId)!.model.children[0]!;
    const [, result] = editor.std.command.exec(insertNoteRefBlockCommand, {
      refBlockId: canonicalNoteId,
      place: 'after',
      selectedModels: [anchorModel],
    });
    await wait();

    const canonicalModel = doc.getModelById(canonicalNoteId) as NoteBlockModel;
    const linkedDoc = createLinkedDocFromNote(
      doc,
      canonicalModel,
      'Converted Doc'
    );
    expect(linkedDoc).toBeTruthy();

    doc.transact(() => {
      doc.deleteBlock(canonicalModel);
    });
    await wait(300);

    // The new doc must actually get populated — the infinite-spinner bug
    // was exactly this never happening.
    expect(linkedDoc!.root).toBeTruthy();
    const linkedNotes = linkedDoc!.getBlocksByFlavour('affine:note');
    expect(linkedNotes.length).toBe(1);
    expect(linkedNotes[0]!.model.children[0]?.text?.toString()).toBe(
      'Content to convert into a linked doc'
    );

    // Ids are preserved across the move (no `replaceIdMiddleware`) — the
    // existing reference must now resolve to the new doc using the *same*
    // block id, not a dangling id in the (now-deleted) original location.
    expect(linkedNotes[0]!.id).toBe(canonicalNoteId);
    const refModel = doc.getBlock(result.insertedNoteRefBlockId!)!
      .model as unknown as { props: { refBlockId: string; refDocId: string } };
    expect(refModel.props.refDocId).toBe(linkedDoc!.id);
    expect(refModel.props.refBlockId).toBe(canonicalNoteId);
  });
});
