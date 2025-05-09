import { toEdgelessEmbedBlock } from '../common/to-edgeless-embed-block.js';
import { EmbedLoomBlockComponent } from './embed-loom-block.js';

export class EmbedEdgelessLoomBlockComponent extends toEdgelessEmbedBlock(
  EmbedLoomBlockComponent
) {}
