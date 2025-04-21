import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import { CodeBlockSchemaExtension } from '@blocksuite/affine-model';

import { CodeBlockAdapterExtensions } from './adapters/extension';

export default class CodeStoreExtension extends StoreExtensionProvider {
  override name = 'affine-code-block';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(CodeBlockSchemaExtension);
    context.register(CodeBlockAdapterExtensions);
  }
}
