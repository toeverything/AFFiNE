import {
  type BlockComponent,
  type Command,
  TextSelection,
} from '@blocksuite/std';

/**
 * Focus the end of the block
 * @param focusBlock - The block to focus
 * @param force - If set to true, the selection will be cleared.
 * It is useful when the selection is same.
 */
export const focusBlockEnd: Command<{
  focusBlock?: BlockComponent;
  force?: boolean;
}> = (ctx, next) => {
  const { focusBlock, force, std } = ctx;
  if (!focusBlock || !focusBlock.model.text) return;

  const { selection } = std;

  std.event.active = true;
  if (force) selection.clear();

  selection.setGroup('note', [
    selection.create(TextSelection, {
      from: {
        blockId: focusBlock.blockId,
        index: focusBlock.model.text.length,
        length: 0,
      },
      to: null,
    }),
  ]);

  return next();
};
