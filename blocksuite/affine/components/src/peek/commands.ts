import {
  getBlockSelectionsCommand,
  getSelectedBlocksCommand,
  getTextSelectionCommand,
} from '@blocksuite/affine-shared/commands';
import type { BlockComponent, Command, InitCommandCtx } from '@blocksuite/std';

import { isPeekable, peek } from './peekable.js';

const getSelectedPeekableBlocks = (cmd: InitCommandCtx) => {
  const [result, ctx] = cmd.std.command
    .chain()
    .tryAll(chain => [
      chain.pipe(getTextSelectionCommand),
      chain.pipe(getBlockSelectionsCommand),
    ])
    .pipe(getSelectedBlocksCommand, { types: ['text', 'block'] })
    .run();
  return ((result ? ctx.selectedBlocks : []) || []).filter(isPeekable);
};

export const getSelectedPeekableBlocksCommand: Command<
  {
    selectedBlocks: BlockComponent[];
  },
  {
    selectedPeekableBlocks: BlockComponent[];
  }
> = (ctx, next) => {
  const selectedPeekableBlocks = getSelectedPeekableBlocks(ctx);
  if (selectedPeekableBlocks.length > 0) {
    next({ selectedPeekableBlocks });
  }
};

export const peekSelectedBlockCommand: Command<{
  selectedBlocks: BlockComponent[];
}> = (ctx, next) => {
  const peekableBlocks = getSelectedPeekableBlocks(ctx);
  // if there are multiple blocks, peek the first one
  const block = peekableBlocks.at(0);

  if (block) {
    peek(block);
    next();
  }
};
