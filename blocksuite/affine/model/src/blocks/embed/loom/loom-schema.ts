import { BlockSchemaExtension } from '@blocksuite/store';

import { createEmbedBlockSchema } from '../../../utils/index.js';
import {
  type EmbedLoomBlockProps,
  EmbedLoomModel,
  EmbedLoomStyles,
} from './loom-model.js';

const defaultEmbedLoomProps: EmbedLoomBlockProps = {
  style: EmbedLoomStyles[0],
  url: '',
  caption: null,

  image: null,
  title: null,
  description: null,
  videoId: null,
};

export const EmbedLoomBlockSchema = createEmbedBlockSchema({
  name: 'loom',
  version: 1,
  toModel: () => new EmbedLoomModel(),
  props: (): EmbedLoomBlockProps => defaultEmbedLoomProps,
});

export const EmbedLoomBlockSchemaExtension =
  BlockSchemaExtension(EmbedLoomBlockSchema);
