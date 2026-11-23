import type { BlockComponent } from '@blocksuite/std';

import { EmbedFigmaBlockComponent } from './embed-figma-block';
import { EmbedGithubBlockComponent } from './embed-github-block';
import { EmbedLoomBlockComponent } from './embed-loom-block';
import { EmbedYoutubeBlockComponent } from './embed-youtube-block';

export type ExternalEmbedBlockComponent =
  | EmbedFigmaBlockComponent
  | EmbedGithubBlockComponent
  | EmbedLoomBlockComponent
  | EmbedYoutubeBlockComponent;

export function isExternalEmbedBlockComponent(
  block: BlockComponent
): block is ExternalEmbedBlockComponent {
  return (
    block instanceof EmbedFigmaBlockComponent ||
    block instanceof EmbedGithubBlockComponent ||
    block instanceof EmbedLoomBlockComponent ||
    block instanceof EmbedYoutubeBlockComponent
  );
}
