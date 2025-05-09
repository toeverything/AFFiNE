import { toEdgelessEmbedBlock } from '../common/to-edgeless-embed-block.js';
import { EmbedYoutubeBlockComponent } from './embed-youtube-block.js';

export class EmbedEdgelessYoutubeBlockComponent extends toEdgelessEmbedBlock(
  EmbedYoutubeBlockComponent
) {}
