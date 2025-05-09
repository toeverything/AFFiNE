import { BlockModel } from '@blocksuite/store';

import type { EmbedCardStyle } from '../../../utils/index.js';
import { defineEmbedModel } from '../../../utils/index.js';

export type EmbedFigmaBlockUrlData = {
  title: string | null;
  description: string | null;
};

export const EmbedFigmaStyles: EmbedCardStyle[] = ['figma'] as const;

export type EmbedFigmaBlockProps = {
  style: (typeof EmbedFigmaStyles)[number];
  url: string;
  caption: string | null;
} & EmbedFigmaBlockUrlData;

export class EmbedFigmaModel extends defineEmbedModel<EmbedFigmaBlockProps>(
  BlockModel
) {}
