import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import {
  htmlLinkElementToDeltaMatcher,
  linkDeltaMarkdownAdapterMatch,
  linkDeltaToHtmlAdapterMatcher,
  linkDeltaToMarkdownAdapterMatcher,
  markdownLinkToDeltaMatcher,
  notionHtmlLinkElementToDeltaMatcher,
} from './adapters';

export class LinkStoreExtension extends StoreExtensionProvider {
  override name = 'affine-link-inline';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(linkDeltaMarkdownAdapterMatch);
    context.register(linkDeltaToMarkdownAdapterMatcher);
    context.register(notionHtmlLinkElementToDeltaMatcher);
    context.register(markdownLinkToDeltaMatcher);
    context.register(htmlLinkElementToDeltaMatcher);
    context.register(linkDeltaToHtmlAdapterMatcher);
  }
}
