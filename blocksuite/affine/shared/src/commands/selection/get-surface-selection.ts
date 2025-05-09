import { SurfaceSelection } from '@blocksuite/std';

import type { GetSelectionCommand } from './types';

export const getSurfaceSelectionCommand: GetSelectionCommand = (ctx, next) => {
  const currentSurfaceSelection = ctx.std.selection.filter(SurfaceSelection)[0];
  if (!currentSurfaceSelection) return;

  next({ currentSurfaceSelection });
};
