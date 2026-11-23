import type { BlockComponent, BlockStdScope, Command } from '@blocksuite/std';

import { getNextContentBlock } from '../../utils/index.js';

function getNextBlock(std: BlockStdScope, path: string) {
  const view = std.view;
  const model = std.store.getBlock(path)?.model;
  if (!model) return null;
  const nextModel = getNextContentBlock(std.host, model);
  if (!nextModel) return null;
  return view.getBlock(nextModel.id);
}

export const getNextBlockCommand: Command<
  {
    currentSelectionPath?: string;
    path?: string;
  },
  {
    nextBlock?: BlockComponent;
  }
> = (ctx, next) => {
  const path = ctx.path ?? ctx.currentSelectionPath;
  if (!path) {
    console.error(
      '`path` is required, you need to pass it in args or ctx before adding this command to the pipeline.'
    );
    return;
  }

  const nextBlock = getNextBlock(ctx.std, path);

  if (nextBlock) {
    next({ nextBlock });
  }
};
