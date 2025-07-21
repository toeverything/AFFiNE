import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { ColumnBlockSchemaExtension } from '@blocksuite/affine-model';

export class ColumnStoreExtension extends StoreExtensionProvider {
  override name = 'affine-column-block';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(ColumnBlockSchemaExtension);
  }
}
