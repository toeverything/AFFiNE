import { buildDocDisplayMetaExtension } from '@affine/core/blocksuite/extensions/display-meta';
import { patchFileSizeLimitExtension } from '@affine/core/blocksuite/extensions/file-size-limit';
import { getFontConfigExtension } from '@affine/core/blocksuite/extensions/font-config';
import { patchPeekViewService } from '@affine/core/blocksuite/extensions/peek-view-service';
import { getTelemetryExtension } from '@affine/core/blocksuite/extensions/telemetry';
import { PeekViewService } from '@affine/core/modules/peek-view';
import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { FrameworkProvider } from '@toeverything/infra';
import { z } from 'zod';

const optionsSchema = z.object({
  framework: z.instanceof(FrameworkProvider).optional(),
});

export class AffineCommonViewExtension extends ViewExtensionProvider<
  z.infer<typeof optionsSchema>
> {
  override name = 'affine-view-extensions';

  override schema = optionsSchema;

  override setup(
    context: ViewExtensionContext,
    options?: z.infer<typeof optionsSchema>
  ) {
    super.setup(context, options);
    const { framework } = options || {};
    if (framework) {
      context.register(patchPeekViewService(framework.get(PeekViewService)));
      context.register([
        getFontConfigExtension(),
        buildDocDisplayMetaExtension(framework),
      ]);
      context.register(getTelemetryExtension());
      if (context.scope === 'edgeless' || context.scope === 'page') {
        context.register(patchFileSizeLimitExtension(framework));
      }
    }
  }
}
