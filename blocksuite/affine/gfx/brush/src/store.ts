import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import {
  brushToMarkdownAdapterMatcher,
  brushToPlainTextAdapterMatcher,
} from './adapter';

export class BrushStoreExtension extends StoreExtensionProvider {
  override name = 'affine-brush-gfx';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(brushToMarkdownAdapterMatcher);
    context.register(brushToPlainTextAdapterMatcher);
  }
}
