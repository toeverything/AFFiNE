import {
  AICodeBlockSpec,
  AIImageBlockSpec,
  AIParagraphBlockSpec,
} from '@affine/core/blocksuite/presets/ai';
import { AIChatBlockSpec } from '@affine/core/blocksuite/presets/blocks/ai-chat-block';
import type { ExtensionType } from '@blocksuite/affine/block-std';
import {
  BookmarkBlockSpec,
  CodeBlockSpec,
  DatabaseBlockSpec,
  DataViewBlockSpec,
  DividerBlockSpec,
  EditPropsStore,
  EmbedFigmaBlockSpec,
  EmbedGithubBlockSpec,
  EmbedHtmlBlockSpec,
  EmbedLinkedDocBlockSpec,
  EmbedLoomBlockSpec,
  EmbedSyncedDocBlockSpec,
  EmbedYoutubeBlockSpec,
  ImageBlockSpec,
  LatexBlockSpec,
  ListBlockSpec,
  ParagraphBlockSpec,
  RefNodeSlotsExtension,
  RichTextExtensions,
} from '@blocksuite/affine/blocks';

import { CustomAttachmentBlockSpec } from './custom/attachment-block';

const CommonBlockSpecs: ExtensionType[] = [
  RefNodeSlotsExtension(),
  EditPropsStore,
  RichTextExtensions,
  LatexBlockSpec,
  ListBlockSpec,
  DatabaseBlockSpec,
  DataViewBlockSpec,
  DividerBlockSpec,
  BookmarkBlockSpec,
  EmbedFigmaBlockSpec,
  EmbedGithubBlockSpec,
  EmbedYoutubeBlockSpec,
  EmbedLoomBlockSpec,
  EmbedHtmlBlockSpec,
  EmbedSyncedDocBlockSpec,
  EmbedLinkedDocBlockSpec,
  // special
  CustomAttachmentBlockSpec,
].flat();

export const DefaultBlockSpecs: ExtensionType[] = [
  CodeBlockSpec,
  ImageBlockSpec,
  ParagraphBlockSpec,
  ...CommonBlockSpecs,
].flat();

export const AIBlockSpecs: ExtensionType[] = [
  AICodeBlockSpec,
  AIImageBlockSpec,
  AIParagraphBlockSpec,
  AIChatBlockSpec,
  ...CommonBlockSpecs,
].flat();
