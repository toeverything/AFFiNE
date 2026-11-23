import {
  AttachmentBlockModel,
  BookmarkBlockModel,
  CalloutBlockModel,
  CodeBlockModel,
  DatabaseBlockModel,
  DividerBlockModel,
  ImageBlockModel,
  ListBlockModel,
  ParagraphBlockModel,
} from '@blocksuite/affine-model';
import { EMBED_BLOCK_MODEL_LIST } from '@blocksuite/affine-shared/consts';
import {
  getNextContentBlock,
  matchModels,
} from '@blocksuite/affine-shared/utils';
import {
  BlockSelection,
  type BlockStdScope,
  TextSelection,
} from '@blocksuite/std';

export function forwardDelete(std: BlockStdScope) {
  const { store, host } = std;
  const text = std.selection.find(TextSelection);
  if (!text) return;
  const isCollapsed = text.isCollapsed();
  const model = store.getBlock(text.from.blockId)?.model;
  if (
    !model ||
    !matchModels(model, [ParagraphBlockModel]) ||
    matchModels(model.parent, [CalloutBlockModel])
  )
    return;
  const isEnd = isCollapsed && text.from.index === model.props.text.length;
  if (!isEnd) return;
  const parent = store.getParent(model);
  if (!parent) return;

  const nextSibling = store.getNext(model);

  if (
    matchModels(nextSibling, [
      AttachmentBlockModel,
      BookmarkBlockModel,
      DatabaseBlockModel,
      CodeBlockModel,
      ImageBlockModel,
      DividerBlockModel,
      ...EMBED_BLOCK_MODEL_LIST,
    ] as const)
  ) {
    std.selection.setGroup('note', [
      std.selection.create(BlockSelection, { blockId: nextSibling.id }),
    ]);
    return true;
  }

  if (matchModels(nextSibling, [ParagraphBlockModel, ListBlockModel])) {
    model.props.text.join(nextSibling.props.text);
    if (nextSibling.children) {
      const parent = store.getParent(nextSibling);
      if (!parent) return false;
      store.moveBlocks(nextSibling.children, parent, model, false);
    }

    store.deleteBlock(nextSibling);
    return true;
  }

  const nextBlock = getNextContentBlock(host, model);
  if (nextBlock?.text) {
    model.props.text.join(nextBlock.text);
    if (nextBlock.children) {
      const parent = store.getParent(nextBlock);
      if (!parent) return false;
      store.moveBlocks(
        nextBlock.children,
        parent,
        store.getParent(model),
        false
      );
    }
    store.deleteBlock(nextBlock);
    return true;
  }

  if (nextBlock) {
    std.selection.setGroup('note', [
      std.selection.create(BlockSelection, { blockId: nextBlock.id }),
    ]);
  }
  return true;
}
