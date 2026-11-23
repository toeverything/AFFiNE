import { getFeatureFlagSyncer } from '@affine/core/blocksuite/store-extensions/feature-flag/feature-flag-syncer';
import { FeatureFlagService } from '@affine/core/modules/feature-flag';
import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { z } from 'zod';

const optionsSchema = z.object({
  featureFlagService: z.instanceof(FeatureFlagService).optional(),
});

export class FeatureFlagStoreExtension extends StoreExtensionProvider {
  override name = 'feature-flag-store-extension';

  override schema = optionsSchema;

  override setup(
    context: StoreExtensionContext,
    options?: z.infer<typeof optionsSchema>
  ) {
    super.setup(context, options);
    const featureFlagService = options?.featureFlagService;
    if (!featureFlagService) {
      return;
    }
    context.register(getFeatureFlagSyncer(featureFlagService));
  }
}
