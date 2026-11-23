import { getEditorConfigExtension } from '@affine/core/blocksuite/view-extensions/editor-config/get-config';
import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { FrameworkProvider } from '@toeverything/infra';
import { z } from 'zod';

const optionsSchema = z.object({
  framework: z.instanceof(FrameworkProvider).optional(),
});

type AffineEditorConfigViewOptions = z.infer<typeof optionsSchema>;

export class AffineEditorConfigViewExtension extends ViewExtensionProvider<AffineEditorConfigViewOptions> {
  override name = 'affine-view-editor-config';

  override schema = optionsSchema;

  override setup(
    context: ViewExtensionContext,
    options?: AffineEditorConfigViewOptions
  ) {
    super.setup(context, options);
    const framework = options?.framework;
    if (!framework) {
      return;
    }

    if (context.scope === 'edgeless' || context.scope === 'page') {
      context.register(getEditorConfigExtension(framework));
    }
  }
}
