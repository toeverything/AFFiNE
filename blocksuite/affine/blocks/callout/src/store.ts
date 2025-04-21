import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { CalloutBlockSchemaExtension } from '@blocksuite/affine-model';

export default class CalloutStoreExtension extends StoreExtensionProvider {
  override name = 'affine-callout-block';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(CalloutBlockSchemaExtension);
  }
}
