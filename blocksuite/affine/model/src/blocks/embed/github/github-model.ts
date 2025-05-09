import { BlockModel } from '@blocksuite/store';

import type { EmbedCardStyle } from '../../../utils/index.js';
import { defineEmbedModel } from '../../../utils/index.js';

export type EmbedGithubBlockUrlData = {
  image: string | null;
  status: string | null;
  statusReason: string | null;
  title: string | null;
  description: string | null;
  createdAt: string | null;
  assignees: string[] | null;
};

export const EmbedGithubStyles: EmbedCardStyle[] = [
  'vertical',
  'horizontal',
  'list',
  'cube',
] as const;

export type EmbedGithubBlockProps = {
  style: (typeof EmbedGithubStyles)[number];
  owner: string;
  repo: string;
  githubType: 'issue' | 'pr';
  githubId: string;
  url: string;
  caption: string | null;
} & EmbedGithubBlockUrlData;

export class EmbedGithubModel extends defineEmbedModel<EmbedGithubBlockProps>(
  BlockModel
) {}
