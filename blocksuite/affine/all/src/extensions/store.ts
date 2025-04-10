import { DataViewBlockSchemaExtension } from '@blocksuite/affine-block-data-view';
import { DatabaseSelectionExtension } from '@blocksuite/affine-block-database';
import { EmbedIframeConfigExtensions } from '@blocksuite/affine-block-embed';
import { ImageStoreSpec } from '@blocksuite/affine-block-image';
import { SurfaceBlockSchemaExtension } from '@blocksuite/affine-block-surface';
import { TableSelectionExtension } from '@blocksuite/affine-block-table';
import {
  AttachmentBlockSchemaExtension,
  BookmarkBlockSchemaExtension,
  CalloutBlockSchemaExtension,
  CodeBlockSchemaExtension,
  DatabaseBlockSchemaExtension,
  DividerBlockSchemaExtension,
  EdgelessTextBlockSchemaExtension,
  EmbedFigmaBlockSchemaExtension,
  EmbedGithubBlockSchemaExtension,
  EmbedHtmlBlockSchemaExtension,
  EmbedIframeBlockSchemaExtension,
  EmbedLinkedDocBlockSchemaExtension,
  EmbedLoomBlockSchemaExtension,
  EmbedSyncedDocBlockSchemaExtension,
  EmbedYoutubeBlockSchemaExtension,
  FrameBlockSchemaExtension,
  ImageBlockSchemaExtension,
  LatexBlockSchemaExtension,
  ListBlockSchemaExtension,
  NoteBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  RootBlockSchemaExtension,
  SurfaceRefBlockSchemaExtension,
  TableBlockSchemaExtension,
  TranscriptionBlockSchemaExtension,
} from '@blocksuite/affine-model';
import {
  HighlightSelectionExtension,
  ImageSelectionExtension,
} from '@blocksuite/affine-shared/selection';
import {
  BlockMetaService,
  EmbedIframeService,
  FeatureFlagService,
  FileSizeLimitService,
  LinkPreviewerService,
} from '@blocksuite/affine-shared/services';
import {
  BlockSelectionExtension,
  CursorSelectionExtension,
  SurfaceSelectionExtension,
  TextSelectionExtension,
} from '@blocksuite/std';
import type { ExtensionType } from '@blocksuite/store';

import {
  getAdapterFactoryExtensions,
  getHtmlAdapterExtensions,
  getMarkdownAdapterExtensions,
  getNotionHtmlAdapterExtensions,
  getPlainTextAdapterExtensions,
} from '../adapters/extension.js';

export const StoreExtensions: ExtensionType[] = [
  CodeBlockSchemaExtension,
  ParagraphBlockSchemaExtension,
  RootBlockSchemaExtension,
  ListBlockSchemaExtension,
  NoteBlockSchemaExtension,
  DividerBlockSchemaExtension,
  ImageBlockSchemaExtension,
  SurfaceBlockSchemaExtension,
  BookmarkBlockSchemaExtension,
  FrameBlockSchemaExtension,
  DatabaseBlockSchemaExtension,
  SurfaceRefBlockSchemaExtension,
  DataViewBlockSchemaExtension,
  AttachmentBlockSchemaExtension,
  EmbedSyncedDocBlockSchemaExtension,
  EmbedLinkedDocBlockSchemaExtension,
  EmbedHtmlBlockSchemaExtension,
  EmbedIframeBlockSchemaExtension,
  EmbedGithubBlockSchemaExtension,
  EmbedFigmaBlockSchemaExtension,
  EmbedLoomBlockSchemaExtension,
  EmbedYoutubeBlockSchemaExtension,
  EdgelessTextBlockSchemaExtension,
  LatexBlockSchemaExtension,
  TableBlockSchemaExtension,
  CalloutBlockSchemaExtension,
  TranscriptionBlockSchemaExtension,

  BlockSelectionExtension,
  TextSelectionExtension,
  SurfaceSelectionExtension,
  CursorSelectionExtension,
  HighlightSelectionExtension,
  ImageSelectionExtension,
  DatabaseSelectionExtension,
  TableSelectionExtension,

  getHtmlAdapterExtensions(),
  getMarkdownAdapterExtensions(),
  getNotionHtmlAdapterExtensions(),
  getPlainTextAdapterExtensions(),
  getAdapterFactoryExtensions(),

  FeatureFlagService,
  LinkPreviewerService,
  FileSizeLimitService,
  ImageStoreSpec,
  BlockMetaService,
  EmbedIframeConfigExtensions,
  EmbedIframeService,
].flat();
