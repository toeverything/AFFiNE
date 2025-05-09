import {
  focusTextModel,
  getInlineEditorByModel,
  selectTextModel,
} from '@blocksuite/affine-rich-text';
import {
  BlockSelection,
  type BlockStdScope,
  TextSelection,
  type UIEventHandler,
} from '@blocksuite/std';

export const textCommonKeymap = (
  std: BlockStdScope
): Record<string, UIEventHandler> => {
  return {
    ArrowUp: () => {
      const text = std.selection.find(TextSelection);
      if (!text) return;
      const inline = getInlineEditorByModel(std, text.from.blockId);
      if (!inline) return;
      return !inline.isFirstLine(inline.getInlineRange());
    },
    ArrowDown: () => {
      const text = std.selection.find(TextSelection);
      if (!text) return;
      const inline = getInlineEditorByModel(std, text.from.blockId);
      if (!inline) return;
      return !inline.isLastLine(inline.getInlineRange());
    },
    Escape: ctx => {
      const text = std.selection.find(TextSelection);
      if (!text) return;

      selectBlock(std, text.from.blockId);
      ctx.get('keyboardState').raw.stopPropagation();
      return true;
    },
    'Mod-a': ctx => {
      const text = std.selection.find(TextSelection);
      if (!text) return;

      const model = std.store.getBlock(text.from.blockId)?.model;
      if (!model || !model.text) return;

      ctx.get('keyboardState').raw.preventDefault();

      if (
        text.from.index === 0 &&
        text.from.length === model.text.yText.length
      ) {
        selectBlock(std, text.from.blockId);
        return true;
      }

      selectTextModel(std, text.from.blockId, 0, model.text.yText.length);
      return true;
    },
    Enter: ctx => {
      const blocks = std.selection.filter(BlockSelection);
      const blockId = blocks.at(-1)?.blockId;

      if (!blockId) return;
      const model = std.store.getBlock(blockId)?.model;
      if (!model || !model.text) return;

      ctx.get('keyboardState').raw.preventDefault();
      focusTextModel(std, blockId, model.text.yText.length);
      return true;
    },
  };
};

function selectBlock(std: BlockStdScope, blockId: string) {
  std.selection.setGroup('note', [
    std.selection.create(BlockSelection, { blockId }),
  ]);
}
