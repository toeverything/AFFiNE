import { ImageSelection } from '../../selection/index.js';
import type { GetSelectionCommand } from './types.js';

export const getImageSelectionsCommand: GetSelectionCommand = (ctx, next) => {
  const currentImageSelections = ctx.std.selection.filter(ImageSelection);
  if (currentImageSelections.length === 0) return;

  next({ currentImageSelections });
};
