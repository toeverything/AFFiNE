import { BlockSchemaExtension, defineBlockSchema } from '@blocksuite/store';

import { defaultEmbedIframeProps, EmbedIframeBlockModel } from './iframe-model';

export const EmbedIframeBlockSchema = defineBlockSchema({
  flavour: 'affine:embed-iframe',
  props: () => defaultEmbedIframeProps,
  metadata: {
    version: 1,
    role: 'content',
  },
  toModel: () => new EmbedIframeBlockModel(),
});

export const EmbedIframeBlockSchemaExtension = BlockSchemaExtension(
  EmbedIframeBlockSchema
);
