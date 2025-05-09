import {
  NoteBlockModel,
  NoteDisplayMode,
  ParagraphBlockModel,
  RootBlockModel,
} from '@blocksuite/affine-model';
import { matchModels } from '@blocksuite/affine-shared/utils';
import type { BlockModel, Store } from '@blocksuite/store';

import { headingKeys } from '../config.js';

export function getNotesFromDoc(
  doc: Store,
  modes: NoteDisplayMode[] = [
    NoteDisplayMode.DocAndEdgeless,
    NoteDisplayMode.DocOnly,
    NoteDisplayMode.EdgelessOnly,
  ]
) {
  const rootModel = doc.root;
  if (!rootModel) return [];

  const notes: NoteBlockModel[] = [];

  rootModel.children.forEach(block => {
    if (!matchModels(block, [NoteBlockModel])) return;

    if (modes.includes(block.props.displayMode$.value)) {
      notes.push(block);
    }
  });

  return notes;
}

export function isRootBlock(block: BlockModel): block is RootBlockModel {
  return matchModels(block, [RootBlockModel]);
}

export function isHeadingBlock(
  block: BlockModel
): block is ParagraphBlockModel {
  return (
    matchModels(block, [ParagraphBlockModel]) &&
    headingKeys.has(block.props.type$.value)
  );
}

export function getHeadingBlocksFromNote(
  note: NoteBlockModel,
  ignoreEmpty = false
) {
  const models = note.children.filter(block => {
    const empty = block.text && block.text.length > 0;
    return isHeadingBlock(block) && (!ignoreEmpty || empty);
  });

  return models;
}

export function getHeadingBlocksFromDoc(
  doc: Store,
  modes: NoteDisplayMode[] = [
    NoteDisplayMode.DocAndEdgeless,
    NoteDisplayMode.DocOnly,
    NoteDisplayMode.EdgelessOnly,
  ],
  ignoreEmpty = false
) {
  const notes = getNotesFromDoc(doc, modes);
  return notes.map(note => getHeadingBlocksFromNote(note, ignoreEmpty)).flat();
}
