import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import { tagDeltaToMarkdownAdapterMatcher } from './adapters';

export class TagStoreExtension extends StoreExtensionProvider {
  override name = 'affine-tag-inline';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(tagDeltaToMarkdownAdapterMatcher);
  }
}
