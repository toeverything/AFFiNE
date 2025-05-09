import {
  type BlockComponent,
  type Command,
  TextSelection,
} from '@blocksuite/std';

export const focusBlockStart: Command<{
  focusBlock?: BlockComponent;
}> = (ctx, next) => {
  const { focusBlock, std } = ctx;
  if (!focusBlock || !focusBlock.model.text) return;

  const { selection } = std;

  selection.setGroup('note', [
    selection.create(TextSelection, {
      from: { blockId: focusBlock.blockId, index: 0, length: 0 },
      to: null,
    }),
  ]);

  return next();
};
