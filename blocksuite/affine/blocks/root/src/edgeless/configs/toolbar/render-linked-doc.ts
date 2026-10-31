import { isFrameBlock } from '@blocksuite/affine-block-frame';
import { getSurfaceBlock, isNoteBlock } from '@blocksuite/affine-block-surface';
import {
  type FrameBlockModel,
  type NoteBlockModel,
  NoteDisplayMode,
  type NoteRefBlockModel,
} from '@blocksuite/affine-model';
import { DocModeProvider } from '@blocksuite/affine-shared/services';
import {
  ensureDocLoaded,
  getBlockProps,
} from '@blocksuite/affine-shared/utils';
import type { EditorHost } from '@blocksuite/std';
import { GfxBlockElementModel, type GfxModel } from '@blocksuite/std/gfx';
import { type Store, Text } from '@blocksuite/store';

import {
  getElementProps,
  mapFrameIds,
  sortEdgelessElements,
} from '../../../edgeless/utils/clone-utils.js';

/**
 * Repoints every existing `affine:note-ref` (in any doc) whose `refBlockId`/
 * `refDocId` pointed at the note that just moved from `sourceDocId` into
 * `destinationDocId`, preserving its own id — mirrors `DocsService.
 * relocateNoteToAnotherDoc`'s identical repoint step (Story 0.5's "Move to
 * another page" action), duplicated here rather than imported since that
 * method lives in the app layer (`packages/frontend/core`), unreachable from
 * this blocksuite package.
 *
 * Must only be called *after* `destinationDocId`'s doc has already been
 * populated (see `createLinkedDocFromNote`'s call ordering) — updating an
 * existing `note-ref`'s `refDocId` to point at it fires that reference's own
 * live `propsUpdated` subscription synchronously (if it's currently
 * mounted), which reacts by calling `ensureDocLoaded` on the new target
 * right away. `Doc.load(initFn)` early-returns without ever invoking
 * `initFn` once `doc.ready` is already `true` — so if that reactive
 * `ensureDocLoaded` call reaches the new doc *before* its own
 * `Store.load(() => addBlock(...))` call has run, it permanently marks the
 * doc "ready" with no content, and the real populate-the-doc call moments
 * later silently no-ops. The new linked doc is then forever empty (no root
 * note, no content) — which is exactly what produced an infinite loading
 * spinner wherever it was opened.
 */
function repointNoteRefsAfterRelocation(
  workspace: Store['workspace'],
  sourceDocId: string,
  noteId: string,
  destinationDocId: string
) {
  for (const [otherDocId, otherDoc] of workspace.docs) {
    if (otherDocId === destinationDocId) continue;
    ensureDocLoaded(otherDoc);
    const otherStore = otherDoc.getStore({ id: otherDocId });
    for (const ref of otherStore.getBlocksByFlavour('affine:note-ref')) {
      const refModel = ref.model as NoteRefBlockModel;
      if (
        refModel.props.refBlockId === noteId &&
        refModel.props.refDocId === sourceDocId
      ) {
        otherStore.updateBlock(refModel, { refDocId: destinationDocId });
      }
    }
  }
}

export function createLinkedDocFromNote(
  doc: Store,
  note: NoteBlockModel,
  docTitle?: string
) {
  const sourceDocId = doc.id;
  const noteId = note.id;

  const _doc = doc.workspace.createDoc();
  // Deliberately no `replaceIdMiddleware` — every existing `affine:note-ref`
  // pointing at this note's id must keep resolving after the move (same
  // choice, same reason, as `DocsService.relocateNoteToAnotherDoc`). An
  // earlier version replaced every id here, which silently orphaned any
  // live reference to this note (permanently dangling `refBlockId`, plus a
  // "Permission denied to access property 'contains'" crash from the
  // reference's own stale, torn-down DOM) the moment this action ran on a
  // referenced note.
  const transformer = doc.getTransformer();
  const blockSnapshot = transformer.blockToSnapshot(note);
  if (!blockSnapshot) {
    console.error('Failed to create linked doc from note');
    return;
  }
  blockSnapshot.props.displayMode = NoteDisplayMode.DocAndEdgeless;
  const linkedDoc = _doc.getStore({ id: doc.id });

  // Populate the new doc *before* repointing any existing reference at it —
  // see `repointNoteRefsAfterRelocation`'s own doc comment for exactly why
  // the reverse order silently produced a permanently empty linked doc.
  linkedDoc.load(() => {
    const rootId = linkedDoc.addBlock('affine:page', {
      title: new Text(docTitle),
    });
    linkedDoc.addBlock('affine:surface', {}, rootId);
    transformer
      .snapshotToBlock(blockSnapshot, linkedDoc, rootId)
      .catch(console.error);
  });

  repointNoteRefsAfterRelocation(
    doc.workspace,
    sourceDocId,
    noteId,
    linkedDoc.id
  );

  return linkedDoc;
}

export function createLinkedDocFromEdgelessElements(
  host: EditorHost,
  elements: GfxModel[],
  docTitle?: string
) {
  const _doc = host.store.workspace.createDoc();
  const transformer = host.store.getTransformer();
  const linkedDoc = _doc.getStore();
  linkedDoc.load(() => {
    const rootId = linkedDoc.addBlock('affine:page', {
      title: new Text(docTitle),
    });
    const surfaceId = linkedDoc.addBlock('affine:surface', {}, rootId);
    const surface = getSurfaceBlock(linkedDoc);
    if (!surface) return;

    const sortedElements = sortEdgelessElements(elements);
    const ids = new Map<string, string>();
    sortedElements.forEach(model => {
      let newId = model.id;
      if (model instanceof GfxBlockElementModel) {
        const blockProps = getBlockProps(model);
        if (isNoteBlock(model)) {
          const blockSnapshot = transformer.blockToSnapshot(model);
          if (blockSnapshot) {
            transformer
              .snapshotToBlock(blockSnapshot, linkedDoc, rootId)
              .catch(console.error);
          }
        } else {
          if (isFrameBlock(model)) {
            mapFrameIds(blockProps as FrameBlockModel['props'], ids);
          }

          newId = linkedDoc.addBlock(model.flavour, blockProps, surfaceId);
        }
      } else {
        const props = getElementProps(model, ids);
        newId = surface.addElement(props);
      }
      ids.set(model.id, newId);
    });
  });

  host.std.get(DocModeProvider).setPrimaryMode('edgeless', linkedDoc.id);
  return linkedDoc;
}
