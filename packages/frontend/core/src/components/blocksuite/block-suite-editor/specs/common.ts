import type { BlockSpec } from '@blocksuite/block-std';
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
  NoteBlockSpec,
} from '@blocksuite/blocks';
import { AIParagraphBlockSpec } from '@blocksuite/presets';

import { CustomAttachmentBlockSpec } from './custom/attachment-block';

export const CommonBlockSpecs: BlockSpec[] = [
  ListBlockSpec,
  NoteBlockSpec,
  DatabaseBlockSpec,
  DataViewBlockSpec,
  DividerBlockSpec,
  CodeBlockSpec,
  ImageBlockSpec,
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
  AIParagraphBlockSpec,
];
