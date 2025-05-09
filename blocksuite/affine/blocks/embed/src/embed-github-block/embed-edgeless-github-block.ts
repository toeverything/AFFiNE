import { toEdgelessEmbedBlock } from '../common/to-edgeless-embed-block.js';
import { EmbedGithubBlockComponent } from './embed-github-block.js';

export class EmbedEdgelessGithubBlockComponent extends toEdgelessEmbedBlock(
  EmbedGithubBlockComponent
) {}
