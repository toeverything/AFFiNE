import {
  type ViewExtensionContext,
  ViewExtensionProvider,
} from '@blocksuite/affine/ext-loader';
import { z } from 'zod';

import { patchDatabaseBlockConfigService } from './database-block-config-service';

const optionsSchema = z.object({});

export type AffineDatabaseViewOptions = z.infer<typeof optionsSchema>;

export class AffineDatabaseViewExtension extends ViewExtensionProvider<AffineDatabaseViewOptions> {
  override name = 'affine-database-view';

  override schema = optionsSchema;

  override setup(
    context: ViewExtensionContext,
    options?: AffineDatabaseViewOptions
  ) {
    super.setup(context, options);

    context.register(patchDatabaseBlockConfigService());
  }
}
