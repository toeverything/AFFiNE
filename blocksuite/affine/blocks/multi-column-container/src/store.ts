import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { MultiColumnContainerBlockSchemaExtension } from '@blocksuite/affine-model';

export class MultiColumnContainerStoreExtension extends StoreExtensionProvider {
  override name = 'affine-multi-column-container-block';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(MultiColumnContainerBlockSchemaExtension);
  }
}
