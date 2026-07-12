import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { ToolbarModuleExtension } from '@blocksuite/affine/shared/services';
import { BlockFlavourIdentifier } from '@blocksuite/affine/std';
import { z } from 'zod';

import { onlyofficeToolbarConfig } from './toolbar';

const optionsSchema = z.object({
  enableOnlyoffice: z.boolean().optional(),
});

type OnlyofficeViewOptions = z.infer<typeof optionsSchema>;

/**
 * Registers an "Open with OnlyOffice" toolbar action on attachment blocks.
 *
 * Low-coupling by design: it only injects a toolbar module via DI (the same
 * mechanism the built-in AI/image toolbars use) and never patches blocksuite
 * core. The action opens a standalone editor page in a new window, so it does
 * not depend on the AFFiNE editor runtime either. Gated by a feature flag.
 */
export class OnlyofficeViewExtension extends ViewExtensionProvider<OnlyofficeViewOptions> {
  override name = 'affine-onlyoffice-view-extension';

  override schema = optionsSchema;

  override setup(
    context: ViewExtensionContext,
    options?: OnlyofficeViewOptions
  ) {
    super.setup(context, options);
    if (!options?.enableOnlyoffice) {
      return;
    }
    context.register(
      ToolbarModuleExtension({
        id: BlockFlavourIdentifier('custom:affine:attachment'),
        config: onlyofficeToolbarConfig,
      })
    );
  }
}
