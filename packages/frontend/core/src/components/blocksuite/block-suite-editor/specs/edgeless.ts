import type { ExtensionType } from '@blocksuite/block-std';
import {
  EdgelessNoteBlockSpec,
  EdgelessSurfaceBlockSpec,
  EdgelessSurfaceRefBlockSpec,
  EdgelessTextBlockSpec,
  FrameBlockSpec,
} from '@blocksuite/blocks';
import type { FrameworkProvider } from '@toeverything/infra';

import { AIBlockSpecs, DefaultBlockSpecs } from './common';
import { createEdgelessRootBlockSpec } from './custom/root-block';

export function createEdgelessModeSpecs(
  framework: FrameworkProvider,
  enableAI: boolean
): ExtensionType[] {
  return [
    ...(enableAI ? AIBlockSpecs : DefaultBlockSpecs),
    EdgelessSurfaceBlockSpec,
    EdgelessSurfaceRefBlockSpec,
    FrameBlockSpec,
    EdgelessTextBlockSpec,
    EdgelessNoteBlockSpec,
    // special
    createEdgelessRootBlockSpec(framework, enableAI),
  ].flat();
}
