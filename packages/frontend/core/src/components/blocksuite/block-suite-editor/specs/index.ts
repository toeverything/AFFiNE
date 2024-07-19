import type { BlockSpec } from '@blocksuite/block-std';
import { DocService, type FrameworkProvider } from '@toeverything/infra';

import { createEdgelessModeSpecs } from './edgeless';
import { createPageModeSpecs } from './page';

export function createBlockSpecs(framework: FrameworkProvider): BlockSpec[] {
  const docService = framework.get(DocService);
  const mode = docService.doc.getMode();
  return mode === 'edgeless'
    ? createEdgelessModeSpecs(framework)
    : createPageModeSpecs(framework);
}
