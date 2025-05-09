import { BlockSchemaExtension } from '@blocksuite/store';

import { createEmbedBlockSchema } from '../../../utils/index.js';
import {
  type EmbedHtmlBlockProps,
  EmbedHtmlModel,
  EmbedHtmlStyles,
} from './html-model.js';

const defaultEmbedHtmlProps: EmbedHtmlBlockProps = {
  style: EmbedHtmlStyles[0],
  caption: null,
  html: undefined,
  design: undefined,
};

export const EmbedHtmlBlockSchema = createEmbedBlockSchema({
  name: 'html',
  version: 1,
  toModel: () => new EmbedHtmlModel(),
  props: (): EmbedHtmlBlockProps => defaultEmbedHtmlProps,
});

export const EmbedHtmlBlockSchemaExtension =
  BlockSchemaExtension(EmbedHtmlBlockSchema);
