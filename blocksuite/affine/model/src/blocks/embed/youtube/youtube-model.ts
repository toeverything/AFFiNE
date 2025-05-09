import { BlockModel } from '@blocksuite/store';

import type { EmbedCardStyle } from '../../../utils/index.js';
import { defineEmbedModel } from '../../../utils/index.js';

export type EmbedYoutubeBlockUrlData = {
  videoId: string | null;
  image: string | null;
  title: string | null;
  description: string | null;
  creator: string | null;
  creatorUrl: string | null;
  creatorImage: string | null;
};

export const EmbedYoutubeStyles: EmbedCardStyle[] = ['video'] as const;

export type EmbedYoutubeBlockProps = {
  style: (typeof EmbedYoutubeStyles)[number];
  url: string;
  caption: string | null;
} & EmbedYoutubeBlockUrlData;

export class EmbedYoutubeModel extends defineEmbedModel<EmbedYoutubeBlockProps>(
  BlockModel
) {}
