import { DatabaseSelectionExtension } from '@blocksuite/affine-block-database';
import {
  RootBlockHtmlAdapterExtension,
  RootBlockMarkdownAdapterExtension,
  RootBlockNotionHtmlAdapterExtension,
} from '@blocksuite/affine-block-root';
import {
  type StoreExtensionContext,
  StoreExtensionProvider,
} from '@blocksuite/affine-ext-loader';
import {
  RootBlockSchemaExtension,
  TranscriptionBlockSchemaExtension,
} from '@blocksuite/affine-model';
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
  LinkPreviewerService,
} from '@blocksuite/affine-shared/services';
import {
  BlockSelectionExtension,
  CursorSelectionExtension,
  SurfaceSelectionExtension,
  TextSelectionExtension,
} from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';

function getAdapterFactoryExtensions(): ExtensionType[] {
  return [
    MarkdownAdapterFactoryExtension,
    PlainTextAdapterFactoryExtension,
    HtmlAdapterFactoryExtension,
    NotionTextAdapterFactoryExtension,
    NotionHtmlAdapterFactoryExtension,
    MixTextAdapterFactoryExtension,
  ];
}

const defaultBlockHtmlAdapterMatchers = [RootBlockHtmlAdapterExtension];

const defaultBlockMarkdownAdapterMatchers = [RootBlockMarkdownAdapterExtension];

const defaultBlockNotionHtmlAdapterMatchers: ExtensionType[] = [
  RootBlockNotionHtmlAdapterExtension,
];

function getHtmlAdapterExtensions(): ExtensionType[] {
  return [...defaultBlockHtmlAdapterMatchers];
}

function getMarkdownAdapterExtensions(): ExtensionType[] {
  return [...defaultBlockMarkdownAdapterMatchers];
}

function getNotionHtmlAdapterExtensions(): ExtensionType[] {
  return [...defaultBlockNotionHtmlAdapterMatchers];
}

const MigratingStoreExtensions: ExtensionType[] = [
  RootBlockSchemaExtension,
  TranscriptionBlockSchemaExtension,

  BlockSelectionExtension,
  TextSelectionExtension,
  SurfaceSelectionExtension,
  CursorSelectionExtension,
  HighlightSelectionExtension,
  DatabaseSelectionExtension,

  getHtmlAdapterExtensions(),
  getMarkdownAdapterExtensions(),
  getNotionHtmlAdapterExtensions(),
  getAdapterFactoryExtensions(),

  FeatureFlagService,
  BlockMetaService,

  // TODO(@mirone): maybe merge these services into a file setting service
  LinkPreviewerService,
  FileSizeLimitService,
  ImageProxyService,
].flat();

export class MigratingStoreExtension extends StoreExtensionProvider {
  override name = 'migrating';

  override setup(context: StoreExtensionContext) {
    super.setup(context);
    context.register(MigratingStoreExtensions);
  }
}
