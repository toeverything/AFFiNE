import { BlockSelection } from '@blocksuite/std';

import type { GetSelectionCommand } from './types';

export const getBlockSelectionsCommand: GetSelectionCommand = (ctx, next) => {
  const currentBlockSelections = ctx.std.selection.filter(BlockSelection);
  if (currentBlockSelections.length === 0) return;

  next({ currentBlockSelections });
};
