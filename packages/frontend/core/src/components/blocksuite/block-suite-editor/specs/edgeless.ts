import { builtInTemplates as builtInEdgelessTemplates } from '@affine/templates/edgeless';
import { builtInTemplates as builtInStickersTemplates } from '@affine/templates/stickers';
import type { ExtensionType } from '@blocksuite/block-std';
import type { TemplateManager } from '@blocksuite/blocks';
import {
  EdgelessNoteBlockSpec,
  EdgelessSurfaceBlockSpec,
  EdgelessSurfaceRefBlockSpec,
  EdgelessTemplatePanel,
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

export function effects() {
  EdgelessTemplatePanel.templates.extend(
    builtInStickersTemplates as TemplateManager
  );
  EdgelessTemplatePanel.templates.extend(
    builtInEdgelessTemplates as TemplateManager
  );
}
