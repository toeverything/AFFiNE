import type { Command } from '@blocksuite/std';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';

import type { SurfaceBlockModel } from '../surface-model';

/**
 * Re-associate bindings for block that have been converted.
 *
 * @param oldId - the old block id
 * @param newId - the new block id
 */
export const reassociateConnectorsCommand: Command<{
  oldId: string;
  newId: string;
}> = (ctx, next) => {
  const { oldId, newId } = ctx;
  const gfx = ctx.std.get(GfxControllerIdentifier);
  if (!oldId || !newId || !gfx.surface) {
    next();
    return;
  }

  const surface = gfx.surface;
  const connectors = (surface as SurfaceBlockModel).getConnectors(oldId);
  for (const { id, source, target } of connectors) {
    if (source.id === oldId) {
      surface.updateElement(id, {
        source: {
          ...source,
          id: newId,
        },
      });
      continue;
    }
    if (target.id === oldId) {
      surface.updateElement(id, {
        target: {
          ...target,
          id: newId,
        },
      });
    }
  }

  next();
};
