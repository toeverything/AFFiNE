import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { TableBlockSchemaExtension } from '@blocksuite/affine-model';

import { TableBlockAdapterExtensions } from './adapters/extension';
import { TableSelectionExtension } from './selection-schema';

export class TableStoreExtension extends StoreExtensionProvider {
  override name = 'affine-table-block';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(TableBlockSchemaExtension);
    context.register(TableBlockAdapterExtensions);
    context.register(TableSelectionExtension);
  }
}
