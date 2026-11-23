import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { DividerBlockSchemaExtension } from '@blocksuite/affine-model';

import { DividerBlockAdapterExtensions } from './adapters/extension';

export class DividerStoreExtension extends StoreExtensionProvider {
  override name = 'affine-divider-block';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(DividerBlockSchemaExtension);
    context.register(DividerBlockAdapterExtensions);
  }
}
