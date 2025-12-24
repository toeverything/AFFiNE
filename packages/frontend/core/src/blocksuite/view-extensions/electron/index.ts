import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { FrameworkProvider } from '@toeverything/infra';
import { z } from 'zod';

import { patchForClipboardInElectron } from './electron-clipboard';

const optionsSchema = z.object({
  framework: z.instanceof(FrameworkProvider).optional(),
});

type ElectronViewExtensionOptions = z.infer<typeof optionsSchema>;

export class ElectronViewExtension extends ViewExtensionProvider<ElectronViewExtensionOptions> {
  override name = 'electron-view-extensions';

  override schema = optionsSchema;

  override setup(
    context: ViewExtensionContext,
    options?: ElectronViewExtensionOptions
  ) {
    super.setup(context, options);
    if (!BUILD_CONFIG.isElectron) return;

    const framework = options?.framework;
    if (!framework) return;

    context.register(patchForClipboardInElectron(framework));
  }
}
