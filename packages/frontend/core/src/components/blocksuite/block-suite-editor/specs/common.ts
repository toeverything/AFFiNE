import {
  AICodeBlockSpec,
  AIImageBlockSpec,
  AIParagraphBlockSpec,
} from '@affine/core/blocksuite/presets/ai';
import type { ExtensionType } from '@blocksuite/block-std';
import {
  BookmarkBlockSpec,
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
  ListBlockSpec,
} from '@blocksuite/blocks';

import { CustomAttachmentBlockSpec } from './custom/attachment-block';

export const CommonBlockSpecs: ExtensionType[] = [
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
  AICodeBlockSpec,
  AIImageBlockSpec,
  AIParagraphBlockSpec,
].flat();
