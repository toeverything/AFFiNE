import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { DatabaseRefBlockSchemaExtension } from '@blocksuite/affine-model';

export class DatabaseRefStoreExtension extends StoreExtensionProvider {
  override name = 'affine-database-ref-block';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(DatabaseRefBlockSchemaExtension);
  }
}
