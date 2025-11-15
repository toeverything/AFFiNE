import type { TextAlign } from '@blocksuite/affine-model';
import {
  getBlockSelectionsCommand,
  getImageSelectionsCommand,
  getSelectedBlocksCommand,
  getTextSelectionCommand,
} from '@blocksuite/affine-shared/commands';
import {
  type BlockComponent,
  type Command,
  TextSelection,
} from '@blocksuite/std';

type UpdateBlockAlignConfig = {
  textAlign: TextAlign;
  selectedBlocks?: BlockComponent[];
};

export const updateBlockAlign: Command<UpdateBlockAlignConfig> = (
  ctx,
  next
) => {
  let { std, textAlign, selectedBlocks } = ctx;

  if (!selectedBlocks) {
    const [result, ctx] = std.command
      .chain()
      .tryAll(chain => [
        chain.pipe(getTextSelectionCommand),
        chain.pipe(getBlockSelectionsCommand),
        chain.pipe(getImageSelectionsCommand),
      ])
      .pipe(getSelectedBlocksCommand, { types: ['text', 'block', 'image'] })
      .run();
    if (result) {
      selectedBlocks = ctx.selectedBlocks;
    }
  }

  if (!selectedBlocks || selectedBlocks.length === 0) return false;

  selectedBlocks.forEach(block => {
    std.store.updateBlock(block.model, { textAlign });
  });

  const selectionManager = std.host.selection;
  const textSelection = selectionManager.find(TextSelection);
  if (!textSelection) {
    return false;
  }
  selectionManager.setGroup('note', [textSelection]);
  return next();
};
