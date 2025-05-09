import { isFrameBlock } from '@blocksuite/affine-block-frame';
import { getSurfaceBlock, isNoteBlock } from '@blocksuite/affine-block-surface';
import {
  type FrameBlockModel,
  type NoteBlockModel,
  NoteDisplayMode,
} from '@blocksuite/affine-model';
import { replaceIdMiddleware } from '@blocksuite/affine-shared/adapters';
import { DocModeProvider } from '@blocksuite/affine-shared/services';
import { getBlockProps } from '@blocksuite/affine-shared/utils';
import type { EditorHost } from '@blocksuite/std';
import { GfxBlockElementModel, type GfxModel } from '@blocksuite/std/gfx';
import { type Store, Text } from '@blocksuite/store';

import {
  getElementProps,
  mapFrameIds,
  sortEdgelessElements,
} from '../../../edgeless/utils/clone-utils.js';

export function createLinkedDocFromNote(
  doc: Store,
  note: NoteBlockModel,
  docTitle?: string
) {
  const _doc = doc.workspace.createDoc();
  const transformer = doc.getTransformer([
    replaceIdMiddleware(doc.workspace.idGenerator),
  ]);
  const blockSnapshot = transformer.blockToSnapshot(note);
  if (!blockSnapshot) {
    console.error('Failed to create linked doc from note');
    return;
  }
  blockSnapshot.props.displayMode = NoteDisplayMode.DocAndEdgeless;
  const linkedDoc = _doc.getStore({ id: doc.id });
  linkedDoc.load(() => {
    const rootId = linkedDoc.addBlock('affine:page', {
      title: new Text(docTitle),
    });
    linkedDoc.addBlock('affine:surface', {}, rootId);
    transformer
      .snapshotToBlock(blockSnapshot, linkedDoc, rootId)
      .catch(console.error);
  });

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
