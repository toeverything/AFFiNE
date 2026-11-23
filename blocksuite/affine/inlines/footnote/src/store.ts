import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';

import {
  footnoteReferenceDeltaToMarkdownAdapterMatcher,
  FootnoteReferenceMarkdownPreprocessorExtension,
  markdownFootnoteReferenceToDeltaMatcher,
} from './adapters';

export class FootnoteStoreExtension extends StoreExtensionProvider {
  override name = 'affine-footnote-inline';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(markdownFootnoteReferenceToDeltaMatcher);
    context.register(footnoteReferenceDeltaToMarkdownAdapterMatcher);
    context.register(FootnoteReferenceMarkdownPreprocessorExtension);
  }
}
