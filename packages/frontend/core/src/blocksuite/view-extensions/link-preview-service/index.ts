import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { FrameworkProvider } from '@toeverything/infra';
import { z } from 'zod';

import { patchLinkPreviewService } from './link-preview-service';

const optionsSchema = z.object({
  framework: z.instanceof(FrameworkProvider).optional(),
});

type AffineLinkPreviewViewOptions = z.infer<typeof optionsSchema>;

export class AffineLinkPreviewExtension extends ViewExtensionProvider<AffineLinkPreviewViewOptions> {
  override name = 'affine-link-preview-extension';

  override schema = optionsSchema;

  override setup(
    context: ViewExtensionContext,
    options?: AffineLinkPreviewViewOptions
  ) {
    super.setup(context, options);
    if (!options?.framework) {
      return;
    }
    const { framework } = options;
    context.register(patchLinkPreviewService(framework));
  }
}
