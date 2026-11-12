import {
  BlockModel,
  BlockSchemaExtension,
  defineBlockSchema,
} from '@blocksuite/store';

export type DividerType =
  | 'solid'
  | 'dotted'
  | 'dashed'
  | 'loosely-dashed'
  | 'lines';

export type DividerProps = {
  type: DividerType;
};

export const DividerBlockSchema = defineBlockSchema({
  flavour: 'affine:divider',
  props: (_internal): DividerProps => ({
    type: 'solid',
  }),
  metadata: {
    version: 1,
    role: 'content',
    children: [],
  },
  toModel: () => new DividerBlockModel(),
});

export class DividerBlockModel extends BlockModel<DividerProps> {}

export const DividerBlockSchemaExtension =
  BlockSchemaExtension(DividerBlockSchema);
