import { toEdgelessEmbedBlock } from '../common/to-edgeless-embed-block.js';
import { EmbedFigmaBlockComponent } from './embed-figma-block.js';

export class EmbedEdgelessBlockComponent extends toEdgelessEmbedBlock(
  EmbedFigmaBlockComponent
) {}
