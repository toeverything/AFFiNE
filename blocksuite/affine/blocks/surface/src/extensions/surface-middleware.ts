import { createIdentifier } from '@blocksuite/global/di';
import type { ExtensionType } from '@blocksuite/store';

import type { SurfaceBlockModel } from '../surface-model';

export type SurfaceMiddleware = (surface: SurfaceBlockModel) => () => void;

export const surfaceMiddlewareIdentifier = createIdentifier<{
  middleware: SurfaceMiddleware;
}>('surface-middleware');

export function surfaceMiddlewareExtension(
  id: string,
  middleware: SurfaceMiddleware
): ExtensionType {
  return {
    setup: di => {
      di.addImpl(surfaceMiddlewareIdentifier(id), {
        middleware,
      });
    },
  };
}
