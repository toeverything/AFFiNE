import type { ExtensionType } from '@blocksuite/block-std';
import {
  NoteBlockSpec,
  PageSurfaceBlockSpec,
  PageSurfaceRefBlockSpec,
} from '@blocksuite/blocks';
import { AIChatBlockSpec } from '@blocksuite/presets';
import { type FrameworkProvider } from '@toeverything/infra';

import { CommonBlockSpecs } from './common';
import { createPageRootBlockSpec } from './custom/root-block';

export function createPageModeSpecs(
  framework: FrameworkProvider
): ExtensionType[] {
  return [
    ...CommonBlockSpecs,
    PageSurfaceBlockSpec,
    PageSurfaceRefBlockSpec,
    NoteBlockSpec,
    AIChatBlockSpec,
    // special
    createPageRootBlockSpec(framework),
  ].flat();
}
