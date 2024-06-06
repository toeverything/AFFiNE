import type { BlockSpec } from '@blocksuite/block-std';
import {
  EdgelessSurfaceBlockSpec,
  EdgelessSurfaceRefBlockSpec,
  EdgelessTextBlockSpec,
  FrameBlockSpec,
} from '@blocksuite/blocks';

import { CommonBlockSpecs } from './common';
import { CustomEdgelessRootBlockSpec } from './custom/root-block';

export const EdgelessModeSpecs: BlockSpec[] = [
  ...CommonBlockSpecs,
  EdgelessSurfaceBlockSpec,
  EdgelessSurfaceRefBlockSpec,
  FrameBlockSpec,
  EdgelessTextBlockSpec,
  // special
  CustomEdgelessRootBlockSpec,
];
