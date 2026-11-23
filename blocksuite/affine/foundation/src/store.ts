import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import {
  HtmlAdapterFactoryExtension,
  ImageProxyService,
  MarkdownAdapterFactoryExtension,
  MixTextAdapterFactoryExtension,
  NotionHtmlAdapterFactoryExtension,
  NotionTextAdapterFactoryExtension,
  PlainTextAdapterFactoryExtension,
} from '@blocksuite/affine-shared/adapters';
import { HighlightSelectionExtension } from '@blocksuite/affine-shared/selection';
import {
  BlockMetaService,
  FeatureFlagService,
} from '@blocksuite/affine-shared/services';
import {
  BlockSelectionExtension,
  CursorSelectionExtension,
  SurfaceSelectionExtension,
  TextSelectionExtension,
} from '@blocksuite/std';

export class FoundationStoreExtension extends StoreExtensionProvider {
  override name = 'foundation';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register([
      // predefined selections
      BlockSelectionExtension,
      TextSelectionExtension,
      SurfaceSelectionExtension,
      CursorSelectionExtension,
      HighlightSelectionExtension,

      // predefined adapters
      MarkdownAdapterFactoryExtension,
      PlainTextAdapterFactoryExtension,
      HtmlAdapterFactoryExtension,
      NotionTextAdapterFactoryExtension,
      NotionHtmlAdapterFactoryExtension,
      MixTextAdapterFactoryExtension,

      // shared services
      FeatureFlagService,
      BlockMetaService,
      // TODO(@mirone): maybe merge these services into a file setting service
      ImageProxyService,
    ]);
  }
}
