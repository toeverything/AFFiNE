import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { EdgelessSurfaceBlockAdapterExtensions } from './adapters';
import { SurfaceBlockSchemaExtension } from './surface-model';

export class SurfaceStoreExtension extends StoreExtensionProvider {
  override name = 'affine-surface-block';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(SurfaceBlockSchemaExtension);
    context.register(EdgelessSurfaceBlockAdapterExtensions);
  }
}
