import { BlockModel } from '@blocksuite/store';

import type { EmbedCardStyle } from '../../../utils/index.js';
import { defineEmbedModel } from '../../../utils/index.js';

export type EmbedLoomBlockUrlData = {
  videoId: string | null;
  image: string | null;
  title: string | null;
  description: string | null;
};

export const EmbedLoomStyles: EmbedCardStyle[] = ['video'] as const;

export type EmbedLoomBlockProps = {
  style: (typeof EmbedLoomStyles)[number];
  url: string;
  caption: string | null;
} & EmbedLoomBlockUrlData;

export class EmbedLoomModel extends defineEmbedModel<EmbedLoomBlockProps>(
  BlockModel
) {}
