import {
  EmbedLoomBlockSchema,
  type EmbedLoomModel,
  EmbedLoomStyles,
} from '@blocksuite/affine-model';
import { EmbedOptionConfig } from '@blocksuite/affine-shared/services';
import { BlockService } from '@blocksuite/std';

import { loomUrlRegex } from './embed-loom-model.js';
import { queryEmbedLoomData } from './utils.js';

export class EmbedLoomBlockService extends BlockService {
  static override readonly flavour = EmbedLoomBlockSchema.model.flavour;

  queryUrlData = (embedLoomModel: EmbedLoomModel, signal?: AbortSignal) => {
    return queryEmbedLoomData(embedLoomModel, signal);
  };
}

export const EmbedLoomBlockOptionConfig = EmbedOptionConfig({
  flavour: EmbedLoomBlockSchema.model.flavour,
  urlRegex: loomUrlRegex,
  styles: EmbedLoomStyles,
  viewType: 'embed',
});
