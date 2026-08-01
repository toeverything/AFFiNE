import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';

export const LayoutColumnBlockSchema = defineBlockSchema({
  flavour: 'affine:layout-column',
  metadata: {
    version: 1,
    role: 'content',
    children: ['*'], // A column can contain any block
  },
  toModel: () => new LayoutColumnBlockModel(),
});

type Props = {
  width: string; // e.g., '50%', '33.33%'
};

export class LayoutColumnBlockModel extends BlockModel<Props> {}

export const LayoutColumnBlockSchemaExtension = BlockSchemaExtension(
  LayoutColumnBlockSchema
);
