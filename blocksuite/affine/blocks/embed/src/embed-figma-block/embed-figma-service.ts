import {
  EmbedFigmaBlockSchema,
  EmbedFigmaStyles,
} from '@blocksuite/affine-model';
import { EmbedOptionConfig } from '@blocksuite/affine-shared/services';

import { figmaUrlRegex } from './embed-figma-model.js';

export const EmbedFigmaBlockOptionConfig = EmbedOptionConfig({
  flavour: EmbedFigmaBlockSchema.model.flavour,
  urlRegex: figmaUrlRegex,
  styles: EmbedFigmaStyles,
  viewType: 'embed',
});
