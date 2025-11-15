import { getPreviewThemeExtension } from '@affine/core/blocksuite/view-extensions/theme/preview-theme';
import { getThemeExtension } from '@affine/core/blocksuite/view-extensions/theme/theme';
import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { FrameworkProvider } from '@toeverything/infra';
import { z } from 'zod';

const optionsSchema = z.object({
  framework: z.instanceof(FrameworkProvider).optional(),
});

type AffineThemeViewOptions = z.infer<typeof optionsSchema>;

export class AffineThemeViewExtension extends ViewExtensionProvider<AffineThemeViewOptions> {
  override name = 'affine-view-theme';

  override schema = optionsSchema;

  override setup(
    context: ViewExtensionContext,
    options?: AffineThemeViewOptions
  ) {
    super.setup(context, options);
    const framework = options?.framework;
    if (!framework) {
      return;
    }

    if (this.isPreview(context.scope)) {
      context.register(getPreviewThemeExtension(framework));
    } else {
      context.register(getThemeExtension(framework));
    }
  }
}
