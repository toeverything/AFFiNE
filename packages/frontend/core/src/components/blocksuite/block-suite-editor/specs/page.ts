import type { ExtensionType } from '@blocksuite/affine/block-std';
import {
  NoteBlockSpec,
  PageSurfaceBlockSpec,
  PageSurfaceRefBlockSpec,
} from '@blocksuite/affine/blocks';
import { type FrameworkProvider } from '@toeverything/infra';

import { AIBlockSpecs, DefaultBlockSpecs } from './common';
import { createPageRootBlockSpec } from './custom/root-block';

export function createPageModeSpecs(
  framework: FrameworkProvider,
  enableAI: boolean
): ExtensionType[] {
  return [
    ...(enableAI ? AIBlockSpecs : DefaultBlockSpecs),
    PageSurfaceBlockSpec,
    PageSurfaceRefBlockSpec,
    NoteBlockSpec,
    // special
    createPageRootBlockSpec(framework, enableAI),
  ].flat();
}
