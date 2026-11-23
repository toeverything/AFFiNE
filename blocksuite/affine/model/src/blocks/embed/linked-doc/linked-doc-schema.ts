import { BlockSchemaExtension } from '@blocksuite/store';

import { createEmbedBlockSchema } from '../../../utils/index.js';
import {
  type EmbedLinkedDocBlockProps,
  EmbedLinkedDocModel,
  EmbedLinkedDocStyles,
} from './linked-doc-model.js';

const defaultEmbedLinkedDocBlockProps: EmbedLinkedDocBlockProps = {
  pageId: '',
  style: EmbedLinkedDocStyles[1],
  caption: null,
  // title & description aliases
  title: undefined,
  description: undefined,

  footnoteIdentifier: null,
};

export const EmbedLinkedDocBlockSchema = createEmbedBlockSchema({
  name: 'linked-doc',
  version: 1,
  toModel: () => new EmbedLinkedDocModel(),
  props: (): EmbedLinkedDocBlockProps => defaultEmbedLinkedDocBlockProps,
});

export const EmbedLinkedDocBlockSchemaExtension = BlockSchemaExtension(
  EmbedLinkedDocBlockSchema
);
