import type { ExtensionType } from '@blocksuite/block-std';
import {
  EdgelessNoteBlockSpec,
  EdgelessSurfaceBlockSpec,
  EdgelessSurfaceRefBlockSpec,
  EdgelessTextBlockSpec,
  FrameBlockSpec,
} from '@blocksuite/blocks';
import { EdgelessAIChatBlockSpec } from '@blocksuite/presets';
import type { FrameworkProvider } from '@toeverything/infra';

import { CommonBlockSpecs } from './common';
import { createEdgelessRootBlockSpec } from './custom/root-block';

export function createEdgelessModeSpecs(
  framework: FrameworkProvider
): ExtensionType[] {
  return [
    ...CommonBlockSpecs,
    EdgelessSurfaceBlockSpec,
    EdgelessSurfaceRefBlockSpec,
    FrameBlockSpec,
    EdgelessTextBlockSpec,
    EdgelessNoteBlockSpec,
    EdgelessAIChatBlockSpec,
    // special
    createEdgelessRootBlockSpec(framework),
  ].flat();
}
