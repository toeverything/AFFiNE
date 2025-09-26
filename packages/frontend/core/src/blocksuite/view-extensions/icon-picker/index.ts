import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { FrameworkProvider } from '@toeverything/infra';
import { z } from 'zod';

import { patchIconPickerService } from './icon-picker-service';

const optionsSchema = z.object({
  framework: z.instanceof(FrameworkProvider).optional(),
});

type AffineIconPickerViewOptions = z.infer<typeof optionsSchema>;

export class AffineIconPickerExtension extends ViewExtensionProvider<AffineIconPickerViewOptions> {
  override name = 'affine-icon-picker-extension';

  override schema = optionsSchema;

  override setup(
    context: ViewExtensionContext,
    options?: AffineIconPickerViewOptions
  ) {
    super.setup(context, options);
    if (!options?.framework) {
      return;
    }
    const { framework } = options;
    context.register(patchIconPickerService(framework));
  }
}
