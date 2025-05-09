import { toEdgelessEmbedBlock } from '../common/to-edgeless-embed-block.js';
import { EmbedHtmlBlockComponent } from './embed-html-block.js';

export class EmbedEdgelessHtmlBlockComponent extends toEdgelessEmbedBlock(
  EmbedHtmlBlockComponent
) {}
