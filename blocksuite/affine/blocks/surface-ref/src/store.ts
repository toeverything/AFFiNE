import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { SurfaceRefBlockSchemaExtension } from '@blocksuite/affine-model';

import { SurfaceRefBlockAdapterExtensions } from './adapters/extension';

export class SurfaceRefStoreExtension extends StoreExtensionProvider {
  override name = 'affine-surface-ref-block';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(SurfaceRefBlockSchemaExtension);
    context.register(SurfaceRefBlockAdapterExtensions);
  }
}
