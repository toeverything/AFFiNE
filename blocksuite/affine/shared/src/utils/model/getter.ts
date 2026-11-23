import { NoteBlockModel, NoteDisplayMode } from '@blocksuite/affine-model';
import type { BlockComponent, BlockStdScope } from '@blocksuite/std';
import type { BlockModel, Store } from '@blocksuite/store';

import { matchModels } from './checker.js';

export function findAncestorModel(
  model: BlockModel,
  match: (m: BlockModel) => boolean
) {
  let curModel: BlockModel | null = model;
  while (curModel) {
    if (match(curModel)) {
      return curModel;
    }
    curModel = curModel.parent;
  }
  return null;
}

/**
 * Get block component by its model and wait for the doc element to finish updating.
 *
 */
export async function asyncGetBlockComponent(
  std: BlockStdScope,
  id: string
): Promise<BlockComponent | null> {
  const rootBlockId = std.store.root?.id;
  if (!rootBlockId) return null;
  const rootComponent = std.view.getBlock(rootBlockId);
  if (!rootComponent) return null;
  await rootComponent.updateComplete;

  return std.view.getBlock(id);
}

export function findNoteBlockModel(model: BlockModel) {
  return findAncestorModel(model, m =>
    matchModels(m, [NoteBlockModel])
  ) as NoteBlockModel | null;
}

export function getLastNoteBlock(doc: Store) {
  let note: NoteBlockModel | null = null;
  if (!doc.root) return null;
  const { children } = doc.root;
  for (let i = children.length - 1; i >= 0; i--) {
    const child = children[i];
    if (
      matchModels(child, [NoteBlockModel]) &&
      child.props.displayMode !== NoteDisplayMode.EdgelessOnly
    ) {
      note = child as NoteBlockModel;
      break;
    }
  }
  return note;
}

export function getFirstNoteBlock(doc: Store) {
  let note: NoteBlockModel | null = null;
  if (!doc.root) return null;
  const { children } = doc.root;
  for (const child of children) {
    if (
      matchModels(child, [NoteBlockModel]) &&
      child.props.displayMode !== NoteDisplayMode.EdgelessOnly
    ) {
      note = child as NoteBlockModel;
      break;
    }
  }
  return note;
}
