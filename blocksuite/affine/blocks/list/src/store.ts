import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { ListBlockSchemaExtension } from '@blocksuite/affine-model';

import { ListBlockAdapterExtensions } from './adapters/extension';
import { ListNumberingWatcherExtension } from './list-numbering-watcher.js';

export class ListStoreExtension extends StoreExtensionProvider {
  override name = 'affine-list-block';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(ListBlockSchemaExtension);
    context.register(ListBlockAdapterExtensions);
    context.register(ListNumberingWatcherExtension);
  }
}
