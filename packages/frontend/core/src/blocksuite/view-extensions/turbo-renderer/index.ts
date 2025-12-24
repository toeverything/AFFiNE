import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { z } from 'zod';

import { turboRendererExtension } from './turbo-renderer';

const optionsSchema = z.object({
  enableTurboRenderer: z.boolean().optional(),
});

type TurboRendererViewOptions = z.infer<typeof optionsSchema>;

export class TurboRendererViewExtension extends ViewExtensionProvider<TurboRendererViewOptions> {
  override name = 'affine-view-turbo-renderer';

  override schema = optionsSchema;

  override setup(
    context: ViewExtensionContext,
    options?: TurboRendererViewOptions
  ) {
    super.setup(context, options);
    const enableTurboRenderer = options?.enableTurboRenderer;
    const isEdgeless = this.isEdgeless(context.scope);

    if (!enableTurboRenderer || !isEdgeless) {
      return;
    }

    context.register(turboRendererExtension);
  }
}
