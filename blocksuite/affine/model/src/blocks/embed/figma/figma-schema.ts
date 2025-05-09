import { BlockSchemaExtension } from '@blocksuite/store';

import { createEmbedBlockSchema } from '../../../utils/index.js';
import {
  type EmbedFigmaBlockProps,
  EmbedFigmaModel,
  EmbedFigmaStyles,
} from './figma-model.js';

const defaultEmbedFigmaProps: EmbedFigmaBlockProps = {
  style: EmbedFigmaStyles[0],
  url: '',
  caption: null,

  title: null,
  description: null,
};

export const EmbedFigmaBlockSchema = createEmbedBlockSchema({
  name: 'figma',
  version: 1,
  toModel: () => new EmbedFigmaModel(),
  props: (): EmbedFigmaBlockProps => defaultEmbedFigmaProps,
});

export const EmbedFigmaBlockSchemaExtension = BlockSchemaExtension(
  EmbedFigmaBlockSchema
);
