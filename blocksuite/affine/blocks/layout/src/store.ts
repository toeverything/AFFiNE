import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import {
  LayoutRowBlockSchemaExtension,
  LayoutColumnBlockSchemaExtension,
} from '@blocksuite/affine-model';

export class LayoutStoreExtension extends StoreExtensionProvider {
  override name = 'affine-layout-block';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(LayoutRowBlockSchemaExtension);
    context.register(LayoutColumnBlockSchemaExtension);
  }
}
