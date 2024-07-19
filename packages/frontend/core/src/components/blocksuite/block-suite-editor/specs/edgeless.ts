import type { BlockSpec } from '@blocksuite/block-std';
import {
  EdgelessNoteBlockSpec,
  EdgelessSurfaceBlockSpec,
  EdgelessSurfaceRefBlockSpec,
  EdgelessTextBlockSpec,
  FrameBlockSpec,
} from '@blocksuite/blocks';
import type { FrameworkProvider } from '@toeverything/infra';

import { CommonBlockSpecs } from './common';
import { createEdgelessRootBlockSpec } from './custom/root-block';

export function createEdgelessModeSpecs(
  framework: FrameworkProvider
): BlockSpec[] {
  return [
    ...CommonBlockSpecs,
    EdgelessSurfaceBlockSpec,
    EdgelessSurfaceRefBlockSpec,
    FrameBlockSpec,
    EdgelessTextBlockSpec,
    EdgelessNoteBlockSpec,
    // special
    createEdgelessRootBlockSpec(framework),
  ];
}
