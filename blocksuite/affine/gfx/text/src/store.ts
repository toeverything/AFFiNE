import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import {
  textToMarkdownAdapterMatcher,
  textToPlainTextAdapterMatcher,
} from './adapter';

export class TextStoreExtension extends StoreExtensionProvider {
  override name = 'affine-text-gfx';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(textToMarkdownAdapterMatcher);
    context.register(textToPlainTextAdapterMatcher);
  }
}
