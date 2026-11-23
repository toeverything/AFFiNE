import type { ElementOrFactory } from '@affine/component';
import {
  patchForEdgelessNoteConfig,
  patchForEmbedSyncedDocConfig,
} from '@affine/core/blocksuite/view-extensions/edgeless-block-header/patch';
import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { FrameworkProvider } from '@toeverything/infra';
import type { TemplateResult } from 'lit';
import { z } from 'zod';

const optionsSchema = z.object({
  isInPeekView: z.boolean(),
  framework: z.instanceof(FrameworkProvider),
  reactToLit: z
    .function()
    .args(z.custom<ElementOrFactory>(), z.boolean().optional())
    .returns(z.custom<TemplateResult>()),
});

export type EdgelessBlockHeaderViewOptions = z.infer<typeof optionsSchema>;

export class EdgelessBlockHeaderConfigViewExtension extends ViewExtensionProvider<EdgelessBlockHeaderViewOptions> {
  override name = 'header-config-view';
  override schema = optionsSchema;

  override setup(
    context: ViewExtensionContext,
    options?: EdgelessBlockHeaderViewOptions
  ) {
    super.setup(context, options);
    if (!options) return;
    const { framework, isInPeekView, reactToLit } = options;

    context.register(
      patchForEdgelessNoteConfig(framework, reactToLit, isInPeekView)
    );
    context.register(patchForEmbedSyncedDocConfig(reactToLit));
  }
}
