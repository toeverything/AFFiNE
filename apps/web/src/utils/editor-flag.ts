import { type BlockSuiteFeatureFlags, config } from '@affine/env';

import type { BlockSuiteWorkspace } from '../shared';

export function setEditorFlags(blockSuiteWorkspace: BlockSuiteWorkspace) {
  Object.entries(config.editorFlags).forEach(([key, value]) => {
    blockSuiteWorkspace.awarenessStore.setFlag(
      key as keyof BlockSuiteFeatureFlags,
      value
    );
  });
}
