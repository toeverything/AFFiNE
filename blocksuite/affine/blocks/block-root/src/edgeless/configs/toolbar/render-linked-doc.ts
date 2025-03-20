import { isFrameBlock } from '@blocksuite/affine-block-frame';
import { getSurfaceBlock, isNoteBlock } from '@blocksuite/affine-block-surface';
import type { FrameBlockModel, NoteBlockModel } from '@blocksuite/affine-model';
import { NoteDisplayMode } from '@blocksuite/affine-model';
import { DocModeProvider } from '@blocksuite/affine-shared/services';
import { getBlockProps } from '@blocksuite/affine-shared/utils';
import type { EditorHost } from '@blocksuite/block-std';
import { GfxBlockElementModel, type GfxModel } from '@blocksuite/block-std/gfx';
import { type BlockModel, type Store, Text } from '@blocksuite/store';

import {
  getElementProps,
  mapFrameIds,
  sortEdgelessElements,
} from '../../../edgeless/utils/clone-utils.js';

function addBlocksToDoc(targetDoc: Store, model: BlockModel, parentId: string) {
  // Add current block to linked doc
  const blockProps = getBlockProps(model);
  const newModelId = targetDoc.addBlock(model.flavour, blockProps, parentId);
  // Add children to linked doc, parent is the new model
  const children = model.children;
  if (children.length > 0) {
    children.forEach(child => {
      addBlocksToDoc(targetDoc, child, newModelId);
    });
  }
}

export function createLinkedDocFromNote(
  doc: Store,
  note: NoteBlockModel,
  docTitle?: string
) {
  const linkedDoc = doc.workspace.createDoc({});
  linkedDoc.load(() => {
    const rootId = linkedDoc.addBlock('affine:page', {
      title: new Text(docTitle),
    });
    linkedDoc.addBlock('affine:surface', {}, rootId);
    const blockProps = getBlockProps(note);
    // keep note props & show in both mode
    const noteId = linkedDoc.addBlock(
      'affine:note',
      {
        ...blockProps,
        hidden: false,
        displayMode: NoteDisplayMode.DocAndEdgeless,
      },
      rootId
    );
    // Add note to linked doc recursively
    note.children.forEach(model => {
      addBlocksToDoc(linkedDoc, model, noteId);
    });
  });

  return linkedDoc;
}

export function createLinkedDocFromEdgelessElements(
  host: EditorHost,
  elements: GfxModel[],
  docTitle?: string
) {
  const linkedDoc = host.doc.workspace.createDoc({});
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
          newId = linkedDoc.addBlock('affine:note', blockProps, rootId);
          // Add note children to linked doc recursively
          model.children.forEach(model => {
            addBlocksToDoc(linkedDoc, model, newId);
          });
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
