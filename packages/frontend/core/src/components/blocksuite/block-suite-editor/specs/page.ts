import type { BlockSpec } from '@blocksuite/block-std';
import {
  PageSurfaceBlockSpec,
  PageSurfaceRefBlockSpec,
} from '@blocksuite/blocks';
import { type FrameworkProvider } from '@toeverything/infra';

import { CommonBlockSpecs } from './common';
import { createPageRootBlockSpec } from './custom/root-block';

export function createPageModeSpecs(framework: FrameworkProvider): BlockSpec[] {
  return [
    ...CommonBlockSpecs,
    PageSurfaceBlockSpec,
    PageSurfaceRefBlockSpec,
    // special
    createPageRootBlockSpec(framework),
  ];
}
