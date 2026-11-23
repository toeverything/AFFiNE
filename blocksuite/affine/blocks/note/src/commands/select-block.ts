import {
  type BlockComponent,
  BlockSelection,
  type Command,
} from '@blocksuite/std';

export const selectBlock: Command<{
  focusBlock?: BlockComponent;
}> = (ctx, next) => {
  const { focusBlock, std } = ctx;
  if (!focusBlock) {
    return;
  }

  const { selection } = std;

  selection.setGroup('note', [
    selection.create(BlockSelection, { blockId: focusBlock.blockId }),
  ]);

  return next();
};
