import {
  AICodeBlockSpec,
  AIImageBlockSpec,
  AIParagraphBlockSpec,
} from '@affine/core/blocksuite/presets/ai';
import type { ExtensionType } from '@blocksuite/block-std';
import {
  BookmarkBlockSpec,
  CodeBlockSpec,
  DatabaseBlockSpec,
  DataViewBlockSpec,
  DividerBlockSpec,
  EmbedFigmaBlockSpec,
  EmbedGithubBlockSpec,
  EmbedHtmlBlockSpec,
  EmbedLinkedDocBlockSpec,
  EmbedLoomBlockSpec,
  EmbedSyncedDocBlockSpec,
  EmbedYoutubeBlockSpec,
  ImageBlockSpec,
  ListBlockSpec,
  ParagraphBlockSpec,
} from '@blocksuite/blocks';
import { AIChatBlockSpec } from '@blocksuite/presets';

import { CustomAttachmentBlockSpec } from './custom/attachment-block';

const CommonBlockSpecs: ExtensionType[] = [
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
