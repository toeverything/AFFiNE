import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import {
  shapeToMarkdownAdapterMatcher,
  shapeToPlainTextAdapterMatcher,
} from './adapter';

export class ShapeStoreExtension extends StoreExtensionProvider {
  override name = 'affine-shape-gfx';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(shapeToMarkdownAdapterMatcher);
    context.register(shapeToPlainTextAdapterMatcher);
  }
}
