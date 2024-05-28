import type { BlockSpec } from '@blocksuite/block-std';
import {
  PageSurfaceBlockSpec,
  PageSurfaceRefBlockSpec,
} from '@blocksuite/blocks';

import { CommonBlockSpecs } from './common';
import { CustomPageRootBlockSpec } from './custom/root-block';

export const PageModeSpecs: BlockSpec[] = [
  ...CommonBlockSpecs,
  PageSurfaceBlockSpec,
  PageSurfaceRefBlockSpec,
  // special
  CustomPageRootBlockSpec,
];
