import { KeyboardToolbarExtension } from '@affine/core/blocksuite/view-extensions/mobile/keyboard-toolbar-extension';
import { MobileFeatureFlagControl } from '@affine/core/blocksuite/view-extensions/mobile/mobile-feature-flag-control';
import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { FrameworkProvider } from '@toeverything/infra';
import { z } from 'zod';

const optionsSchema = z.object({
  framework: z.instanceof(FrameworkProvider).optional(),
});

type MobileViewOptions = z.infer<typeof optionsSchema>;

export class MobileViewExtension extends ViewExtensionProvider<MobileViewOptions> {
  override name = 'mobile-view-extension';

  override schema = optionsSchema;

  override setup(context: ViewExtensionContext, options?: MobileViewOptions) {
    super.setup(context, options);
    const isMobile = BUILD_CONFIG.isMobileEdition;
    if (!isMobile) return;

    const framework = options?.framework;
    if (framework) {
      context.register(KeyboardToolbarExtension(framework));
    }

    context.register(MobileFeatureFlagControl);
  }
}
