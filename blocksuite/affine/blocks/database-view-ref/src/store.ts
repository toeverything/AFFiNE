import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { DatabaseViewRefBlockSchemaExtension } from '@blocksuite/affine-model';

export class DatabaseViewRefStoreExtension extends StoreExtensionProvider {
  override name = 'affine-database-view-ref-block';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(DatabaseViewRefBlockSchemaExtension);
  }
}
