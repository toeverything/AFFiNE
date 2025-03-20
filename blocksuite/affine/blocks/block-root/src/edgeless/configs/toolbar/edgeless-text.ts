import { EdgelessTextBlockModel } from '@blocksuite/affine-model';
import { type ToolbarModuleConfig } from '@blocksuite/affine-shared/services';

import { createTextActions } from './text-common';

export const builtinEdgelessTextToolbarConfig = {
  // No need to adjust element bounds, which updates itself using ResizeObserver
  actions: createTextActions(EdgelessTextBlockModel, 'edgeless-text'),

  when: ctx => ctx.getSurfaceModelsByType(EdgelessTextBlockModel).length > 0,
} as const satisfies ToolbarModuleConfig;
