import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import {
  mindmapToMarkdownAdapterMatcher,
  mindmapToPlainTextAdapterMatcher,
} from './adapter';

export class MindmapStoreExtension extends StoreExtensionProvider {
  override name = 'affine-mindmap-gfx';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(mindmapToPlainTextAdapterMatcher);
    context.register(mindmapToMarkdownAdapterMatcher);
  }
}
